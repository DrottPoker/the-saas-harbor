-- The scheduled jobs: their schedules, that the send jobs call the app only while something is due,
-- that a run calls nothing without the Vault settings, the request it queues with them, the daily
-- cleanup of handled emails, and that no API role can start one. Runs in a rolled-back
-- transaction, so no queued request is ever sent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select results_eq(
  $$ select jobname::text, schedule::text from cron.job where jobname like 'harbor-%' order by 1 $$,
  $$ values ('harbor-analytics-retention'::text, '41 3 * * *'::text),
    ('harbor-domain-checks', '23 * * * *'), ('harbor-email-retention', '33 3 * * *'),
    ('harbor-email-send', '* * * * *'), ('harbor-feedback-retention', '37 3 * * *'),
    ('harbor-job-history', '17 3 * * *'),
    ('harbor-revenue-sync', '*/10 * * * *'), ('harbor-telegram-retention', '29 3 * * *'),
    ('harbor-telegram-send', '* * * * *'), ('harbor-unfinished-signups', '53 3 * * *') $$,
  'emails and Telegram alerts every minute, revenue every ten minutes, domains hourly, cleanup daily');
select ok(
  (select command like '%/api/email/send%' from cron.job where jobname = 'harbor-email-send')
  and (select command like '%/api/revenue/sync%' from cron.job where jobname = 'harbor-revenue-sync')
  and (select command like '%/api/domains/check%' from cron.job where jobname = 'harbor-domain-checks')
  and (select command like '%/api/telegram/send%' from cron.job where jobname = 'harbor-telegram-send'),
  'each job calls its route');
select ok(
  (select command like '%where private.emails_due()%' from cron.job where jobname = 'harbor-email-send')
  and (select command like '%where private.telegram_alerts_due()%' from cron.job
    where jobname = 'harbor-telegram-send'),
  'the send jobs call their routes only while something is due');

-- The queues start empty here, whatever the local stack holds; the transaction is rolled back.
delete from private.email_outbox;
delete from private.telegram_alerts;
insert into auth.users(id, email) values
  ('a8000000-0000-4000-8000-000000000001', 'scheduling@example.com');
delete from private.telegram_alerts;
select ok(not private.emails_due() and not private.telegram_alerts_due(),
  'with empty queues nothing is due');

insert into private.email_outbox(user_id, kind, topic, send_after) values
  ('a8000000-0000-4000-8000-000000000001', 'reports', 'later', now() + interval '5 minutes');
insert into private.telegram_alerts(kind, user_id, send_after) values
  ('signup', 'a8000000-0000-4000-8000-000000000001', now() + interval '5 minutes');
select ok(not private.emails_due() and not private.telegram_alerts_due(),
  'an email or alert waiting for later is not due');

update private.email_outbox set send_after = now() - interval '1 minute',
  locked_until = now() + interval '1 minute';
update private.telegram_alerts set send_after = now() - interval '1 minute',
  locked_until = now() + interval '1 minute';
select ok(not private.emails_due() and not private.telegram_alerts_due(),
  'one a run is sending is not due');

update private.email_outbox set locked_until = now() - interval '1 second';
update private.telegram_alerts set locked_until = null;
select ok(private.emails_due() and private.telegram_alerts_due(),
  'one whose time has come, or whose run stopped, is due');

update private.email_outbox set status = 'sent', processed_at = now();
update private.telegram_alerts set status = 'sent', processed_at = now();
select ok(not private.emails_due() and not private.telegram_alerts_due(),
  'sent ones are not due');

insert into private.email_outbox(user_id, kind, topic, status, processed_at) values
  ('a8000000-0000-4000-8000-000000000001', 'reports', 'old', 'sent', now() - interval '8 days');
select private.prune_email_outbox();
select results_eq(
  $$ select topic from private.email_outbox order by topic $$,
  $$ values ('later'::text) $$,
  'the daily cleanup deletes emails handled more than seven days ago');

delete from vault.secrets where name in ('harbor_site_url', 'harbor_cron_secret');
select is(private.run_scheduled_job('/api/email/send', 60000), null,
  'without the Vault settings a run calls nothing');

select vault.create_secret('https://harbor.example/', 'harbor_site_url');
select vault.create_secret('s3cret-s3cret-s3cret-s3cret-s3cret', 'harbor_cron_secret');
create temp table pgtap_request as
select private.run_scheduled_job('/api/revenue/sync', 310000) as id;
select results_eq(
  $$ select q.method::text, q.url, q.headers->>'Authorization', q.timeout_milliseconds
     from net.http_request_queue q join pgtap_request r on r.id = q.id $$,
  $$ values ('POST'::text, 'https://harbor.example/api/revenue/sync'::text,
    'Bearer s3cret-s3cret-s3cret-s3cret-s3cret'::text, 310000) $$,
  'with them a run queues a POST with the bearer secret');

select ok(not has_function_privilege('anon', 'private.run_scheduled_job(text,integer)', 'execute'),
  'visitors cannot start a job');
select ok(
  not has_function_privilege('authenticated', 'private.run_scheduled_job(text,integer)', 'execute'),
  'makers cannot start a job');
select ok(
  not has_function_privilege('service_role', 'private.run_scheduled_job(text,integer)', 'execute'),
  'the service role cannot start a job');
select ok(
  not exists (
    select 1 from unnest(array['private.emails_due()', 'private.telegram_alerts_due()',
      'private.prune_email_outbox()']) f
    cross join unnest(array['anon', 'authenticated', 'service_role']) r
    where has_function_privilege(r, f, 'execute')),
  'no API role can check the queues or clean them up');
select ok(not has_schema_privilege('anon', 'cron', 'usage')
  and not has_schema_privilege('authenticated', 'cron', 'usage'),
  'API roles cannot see or change the schedules');

select * from finish();
rollback;

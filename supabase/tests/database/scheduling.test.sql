-- The scheduled jobs: their schedules, that a run calls nothing without the Vault settings, the
-- request it queues with them, and that no API role can start one. Runs in a rolled-back
-- transaction, so no queued request is ever sent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select results_eq(
  $$ select jobname::text, schedule::text from cron.job where jobname like 'harbor-%' order by 1 $$,
  $$ values ('harbor-email-send'::text, '* * * * *'::text), ('harbor-job-history', '17 3 * * *'),
    ('harbor-revenue-sync', '*/10 * * * *') $$,
  'emails every minute, revenue every ten minutes, history cleanup daily');
select ok(
  (select command like '%/api/email/send%' from cron.job where jobname = 'harbor-email-send')
  and (select command like '%/api/revenue/sync%' from cron.job where jobname = 'harbor-revenue-sync'),
  'each job calls its route');

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
select ok(not has_schema_privilege('anon', 'cron', 'usage')
  and not has_schema_privilege('authenticated', 'cron', 'usage'),
  'API roles cannot see or change the schedules');

select * from finish();
rollback;

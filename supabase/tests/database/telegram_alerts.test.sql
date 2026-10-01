-- Telegram alerts: what queues an alert, what the worker reads when it sends one, retries, and that
-- alerts go with the account and the feedback. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Sign-up sets created_at and the provider; the username arrives as user metadata.
insert into auth.users(id, email, created_at, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'newcomer@telegram.test', now(), null,
    '{"provider": "email"}', '{"username": "tgnewcomer", "terms_version": "2026-09-27"}'),
  ('a7000000-0000-4000-8000-000000000002', 'googler@telegram.test', now(), now(),
    '{"provider": "google"}', '{}'),
  ('a7000000-0000-4000-8000-000000000003', 'veteran@telegram.test', now() - interval '3 days',
    now(), '{"provider": "email"}', '{}');
create temp view pgtap_alerts as
  select a.* from private.telegram_alerts a where a.user_id::text like 'a7000000-%';

select results_eq($$ select kind, user_id from pgtap_alerts $$,
  $$ values ('signup'::text, 'a7000000-0000-4000-8000-000000000001'::uuid) $$,
  'a sign-up with a username queues an alert');

-- A Google sign-up is new once it is finished; an older account's first profile is not.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select public.complete_signup('tggoogler', current_date);
reset role;
insert into public.profiles(id, name) values ('a7000000-0000-4000-8000-000000000003', 'Old Hand');
select results_eq($$ select kind, user_id from pgtap_alerts order by id $$,
  $$ values ('signup'::text, 'a7000000-0000-4000-8000-000000000001'::uuid),
    ('signup', 'a7000000-0000-4000-8000-000000000002') $$,
  'finishing a Google sign-up queues an alert, and an older account''s first profile does not');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
select public.submit_feedback('bug', 'The <b>chart</b> is empty in Safari', '/dashboard');
reset role;
select results_eq(
  $$ select a.feedback_id from pgtap_alerts a where a.kind = 'feedback' $$,
  $$ select f.id from public.feedback f where f.user_id = 'a7000000-0000-4000-8000-000000000001' $$,
  'feedback queues an alert');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
select throws_ok('select count(*) from private.telegram_alerts', '42501', null,
  'users cannot read the alerts');
select throws_ok('select * from public.claim_telegram_alerts(10)', '42501', null,
  'users cannot claim alerts');
select throws_ok($$ select public.complete_telegram_alert(1, 'sent', null, null) $$, '42501', null,
  'users cannot complete alerts');
reset role;

-- The worker reads what each alert says when it claims it.
create temp table pgtap_claimed (id bigint, kind text, user_id uuid, feedback_id uuid,
  context jsonb);
grant all on pgtap_claimed to service_role;
set local role service_role;
insert into pgtap_claimed
select * from public.claim_telegram_alerts(100) where user_id::text like 'a7000000-%';
reset role;
select results_eq($$ select kind, context from pgtap_claimed order by id $$,
  $$ values
    ('signup'::text, jsonb_build_object('name', 'tgnewcomer', 'username', 'tgnewcomer',
      'provider', 'email', 'confirmed', false, 'accounts', (select count(*) from auth.users))),
    ('signup', jsonb_build_object('name', 'tggoogler', 'username', 'tggoogler',
      'provider', 'google', 'confirmed', true, 'accounts', (select count(*) from auth.users))),
    ('feedback', jsonb_build_object('name', 'tgnewcomer', 'username', 'tgnewcomer',
      'feedback_kind', 'bug', 'message', 'The <b>chart</b> is empty in Safari',
      'page', '/dashboard')) $$,
  'alerts name the user, how a new account signed up, and the feedback');
select is_empty($$ select 1 from pgtap_claimed where context::text like '%@telegram.test%' $$,
  'no alert carries an email address');

set local role service_role;
select is_empty(
  $$ select * from public.claim_telegram_alerts(100) where user_id::text like 'a7000000-%' $$,
  'claimed alerts are not claimed again while they are being sent');
select public.complete_telegram_alert(c.id, 'sent', null, null) from pgtap_claimed c
where c.user_id = 'a7000000-0000-4000-8000-000000000002';
select public.complete_telegram_alert(c.id, 'failed', 'Too Many Requests: retry after 120', 120)
from pgtap_claimed c where c.kind = 'feedback';
reset role;
select results_eq(
  $$ select status, processed_at is not null, last_error from pgtap_alerts
     where user_id = 'a7000000-0000-4000-8000-000000000002' $$,
  $$ values ('sent'::text, true, null::text) $$,
  'a sent alert is recorded');
select ok((select a.status = 'pending' and a.processed_at is null and a.locked_until is null
    and a.send_after > now() + interval '110 seconds'
  from pgtap_alerts a where a.kind = 'feedback'),
  'a failed alert is tried again, no sooner than Telegram asks');

update private.telegram_alerts set attempts = 5 where kind = 'feedback'
  and user_id = 'a7000000-0000-4000-8000-000000000001';
select public.complete_telegram_alert(a.id, 'failed', 'Bad Request: chat not found', null)
from pgtap_alerts a where a.kind = 'feedback';
select is((select a.status from pgtap_alerts a where a.kind = 'feedback'), 'failed',
  'an alert that failed five times is given up');

-- A failure of Telegram or the setup puts the alert back without counting the attempt that
-- claimed it, and waits as long as Telegram asks.
update private.telegram_alerts set status = 'pending', processed_at = null, attempts = 3
  where kind = 'feedback' and user_id = 'a7000000-0000-4000-8000-000000000001';
select public.complete_telegram_alert(a.id, 'deferred', 'Too Many Requests: retry after 120', 120)
from pgtap_alerts a where a.kind = 'feedback';
select ok((select a.status = 'pending' and a.attempts = 2 and a.processed_at is null
    and a.locked_until is null and a.send_after > now() + interval '110 seconds'
  from pgtap_alerts a where a.kind = 'feedback'),
  'an outage or a rate limit puts the alert back without counting the attempt');

-- Alerts that waited a day, such as while Telegram was not configured, are not sent late.
update private.telegram_alerts set created_at = now() - interval '2 days', locked_until = null
where kind = 'signup' and user_id = 'a7000000-0000-4000-8000-000000000001';
set local role service_role;
select count(*) from public.claim_telegram_alerts(100);
reset role;
select results_eq(
  $$ select status, last_error from pgtap_alerts
     where kind = 'signup' and user_id = 'a7000000-0000-4000-8000-000000000001' $$,
  $$ values ('skipped'::text, 'Too old to send'::text) $$,
  'an alert that waited a day is skipped rather than sent late');

-- Alerts go with the feedback and with the account.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select public.submit_feedback('suggestion', 'Please add a dark theme for the charts', null);
reset role;
delete from public.feedback where user_id = 'a7000000-0000-4000-8000-000000000002';
select is_empty($$ select 1 from pgtap_alerts
    where kind = 'feedback' and user_id = 'a7000000-0000-4000-8000-000000000002' $$,
  'deleting feedback deletes its alert');
select private.remove_account('a7000000-0000-4000-8000-000000000001');
select is_empty($$ select 1 from pgtap_alerts
    where user_id = 'a7000000-0000-4000-8000-000000000001' $$,
  'deleting an account deletes its alerts');

select * from finish();
rollback;

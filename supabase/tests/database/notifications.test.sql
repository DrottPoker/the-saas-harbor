-- Email notifications: what queues an email, how repeats are limited, and the worker's claim and
-- completion. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'writer@notify.test'),
  ('a1000000-0000-4000-8000-000000000002', 'reader@notify.test'),
  ('a1000000-0000-4000-8000-000000000003', 'admin@notify.test'),
  ('a1000000-0000-4000-8000-000000000004', 'quiet-admin@notify.test');
insert into public.profiles(id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'Notify Writer'),
  ('a1000000-0000-4000-8000-000000000002', 'Notify Reader'),
  ('a1000000-0000-4000-8000-000000000003', 'Notify Admin'),
  ('a1000000-0000-4000-8000-000000000004', 'Quiet Admin');
insert into private.admins(user_id) values
  ('a1000000-0000-4000-8000-000000000003'), ('a1000000-0000-4000-8000-000000000004');
create temp view pgtap_outbox as
  select o.* from private.email_outbox o where o.user_id::text like 'a1000000-%';

-- Settings: each maker reads and writes only their own.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select lives_ok($$ select public.save_notification_settings(true, false) $$,
  'a maker saves their settings');
select results_eq($$ select messages, reports from public.notification_settings $$,
  $$ values (true, false) $$, 'makers read their own settings');
select throws_ok(
  $$ insert into public.notification_settings(user_id, messages) values ('a1000000-0000-4000-8000-000000000002', false) $$,
  '42501', null, 'makers cannot write another maker''s settings');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select is_empty('select 1 from public.notification_settings',
  'makers cannot read another maker''s settings');
select throws_ok('select count(*) from private.email_outbox', '42501', null,
  'makers cannot read the outbox');
select throws_ok($$ select * from public.claim_emails(10, 0) $$, '42501', null,
  'makers cannot claim emails');
select throws_ok($$ select public.complete_email(1, 'sent', null) $$, '42501', null,
  'makers cannot complete emails');

-- Messages: one email per conversation until the recipient reads it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select public.send_message('a1000000-0000-4000-8000-000000000002', 'First message');
select public.send_message('a1000000-0000-4000-8000-000000000002', 'Second message');
reset role;
select results_eq(
  $$ select user_id, kind from pgtap_outbox where kind = 'message' $$,
  $$ values ('a1000000-0000-4000-8000-000000000002'::uuid, 'message'::text) $$,
  'two messages queue one email for the recipient');
select is_empty($$ select 1 from pgtap_outbox where payload::text like '%First message%' or payload::text like '%Second message%' $$,
  'the queued email holds no message text');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.mark_conversation_read((select id from public.conversations
  where 'a1000000-0000-4000-8000-000000000002' in (user_a, user_b)), clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select public.send_message('a1000000-0000-4000-8000-000000000002', 'After reading');
reset role;
select is((select count(*)::int from pgtap_outbox where kind = 'message'), 2,
  'a message after the recipient read the conversation queues a new email');

-- The worker claims due emails; message emails wait for the delay. The first email was queued
-- before the recipient read the conversation, so only the second one counts the new message.
set local role service_role;
select is_empty($$ select * from public.claim_emails(10, 3600) where kind = 'message' and email like '%@notify.test' $$,
  'message emails wait for the delay');
select results_eq(
  $$ select c.email, c.name, c.context ->> 'sender_name', (c.context ->> 'wanted')::boolean,
      (c.context ->> 'unread')::int
    from public.claim_emails(10, 0) c where c.kind = 'message' and c.email like '%@notify.test'
    order by c.id $$,
  $$ values ('reader@notify.test'::text, 'Notify Reader'::text, 'Notify Writer'::text, true, 0),
    ('reader@notify.test'::text, 'Notify Reader'::text, 'Notify Writer'::text, true, 1) $$,
  'message emails know both makers, and an unread message counts in one email only');
select is_empty($$ select * from public.claim_emails(10, 0) where kind = 'message' and email like '%@notify.test' $$,
  'claimed emails are not claimed twice while locked');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select public.save_notification_settings(false, true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.send_message('a1000000-0000-4000-8000-000000000001', 'A reply');
reset role;
select is_empty(
  $$ select 1 from pgtap_outbox where user_id = 'a1000000-0000-4000-8000-000000000001' $$,
  'makers who turned message emails off get none');

-- Completion: sent emails are done; failures are tried again, five times in all.
select public.complete_email((select min(id) from pgtap_outbox where kind = 'message'), 'sent', null);
select results_eq(
  $$ select status, processed_at is not null from pgtap_outbox where kind = 'message' order by id limit 1 $$,
  $$ values ('sent'::text, true) $$, 'a sent email is recorded');
select public.complete_email((select max(id) from pgtap_outbox where kind = 'message'), 'failed',
  'Connection refused');
select results_eq(
  $$ select status, last_error, send_after > now() from pgtap_outbox where kind = 'message' order by id desc limit 1 $$,
  $$ values ('pending'::text, 'Connection refused'::text, true) $$,
  'a failed email waits and is tried again');
update private.email_outbox set attempts = 5
  where id = (select max(id) from pgtap_outbox where kind = 'message');
select public.complete_email((select max(id) from pgtap_outbox where kind = 'message'), 'failed',
  'Connection refused');
select is((select status from pgtap_outbox where kind = 'message' order by id desc limit 1),
  'failed', 'after five attempts an email is given up');
select throws_ok($$ select public.complete_email(1, 'lost', null) $$, 'P0001', null,
  'unknown outcomes are refused');

-- Reports: each admin who wants them gets one waiting email.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.submit_report('profile', 'a1000000-0000-4000-8000-000000000001', 'spam', '');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select public.submit_report('profile', 'a1000000-0000-4000-8000-000000000002', 'harassment', '');
reset role;
select results_eq(
  $$ select user_id, count(*)::int from pgtap_outbox where kind = 'reports' group by user_id $$,
  $$ values ('a1000000-0000-4000-8000-000000000003'::uuid, 1) $$,
  'two reports queue one email for the admin who wants them');
set local role service_role;
select results_eq(
  $$ select (context ->> 'open')::int >= 2, (context ->> 'wanted')::boolean from public.claim_emails(10, 0) where kind = 'reports' and email = 'admin@notify.test' $$,
  $$ values (true, true) $$, 'the report email counts the open reports when it is sent');
reset role;
select public.complete_email((select id from pgtap_outbox where kind = 'reports'), 'sent', null);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.submit_report('profile', 'a1000000-0000-4000-8000-000000000003', 'other', 'A third report.');
reset role;
select is(
  (select send_after > now() + interval '50 minutes' from pgtap_outbox
    where kind = 'reports' and status = 'pending'),
  true, 'the next report email waits an hour after the last one');

-- Decisions reach the maker; outcomes reach the reporter.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select public.admin_suspend_account('a1000000-0000-4000-8000-000000000001', 'spam',
  'Sent the same advertisement to many makers.',
  (select id from public.reports where subject_id = 'a1000000-0000-4000-8000-000000000001'));
select public.admin_restore_account('a1000000-0000-4000-8000-000000000001', 'Internal note.');
reset role;
select results_eq(
  $$ select payload ->> 'action', payload ->> 'reason', payload ->> 'note' from pgtap_outbox
    where kind = 'decision' order by id $$,
  $$ values ('suspend_account'::text, 'spam'::text, 'Sent the same advertisement to many makers.'::text),
    ('restore_account'::text, null::text, ''::text) $$,
  'decisions queue emails to the maker, without the admins'' internal notes');
select results_eq(
  $$ select user_id, kind from pgtap_outbox where kind = 'outcome' $$,
  $$ values ('a1000000-0000-4000-8000-000000000002'::uuid, 'outcome'::text) $$,
  'the reporter is told the outcome');
set local role service_role;
select results_eq(
  $$ select context ->> 'status', context ->> 'target', context ->> 'name' from public.claim_emails(10, 0) where kind = 'outcome' and email = 'reader@notify.test' $$,
  $$ values ('actioned'::text, 'profile'::text, 'Notify Writer'::text) $$,
  'the outcome email knows what was reported and what happened');

-- A blocked sender's email is still claimed, but the context says to skip it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select public.save_notification_settings(true, true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.send_message('a1000000-0000-4000-8000-000000000001', 'Before the block');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into public.blocks(blocker_id, blocked_id)
  values ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');
set local role service_role;
select results_eq(
  $$ select (context ->> 'unread')::int, (context ->> 'blocked')::boolean from public.claim_emails(10, 0)
    where kind = 'message' and email = 'writer@notify.test' $$,
  $$ values (2, true) $$,
  'a message email counts the unread messages and marks a blocked sender');

-- Old history goes, and account deletion removes settings and queued emails.
reset role;
update private.email_outbox set processed_at = now() - interval '8 days'
  where id = (select min(id) from pgtap_outbox where status = 'sent');
select public.complete_email((select max(id) from pgtap_outbox), 'skipped', 'Blocked');
select is((select count(*)::int from pgtap_outbox where processed_at < now() - interval '7 days'),
  1, 'completing an email leaves history to the worker');
select count(*) from public.claim_emails(1, 3600);
select is((select count(*)::int from pgtap_outbox where processed_at < now() - interval '7 days'),
  0, 'the worker deletes history older than a week');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok('select public.delete_account()', 'a maker deletes their account');
select set_config('request.jwt.claims', '', true);
reset role;
select is_empty(
  $$ select 1 from public.notification_settings where user_id = 'a1000000-0000-4000-8000-000000000001'
    union all select 1 from private.email_outbox where user_id = 'a1000000-0000-4000-8000-000000000001' $$,
  'settings and queued emails go with the account');
select isnt_empty(
  $$ select 1 from private.email_outbox where user_id = 'a1000000-0000-4000-8000-000000000003' $$,
  'other people''s emails stay');
select ok(
  not has_function_privilege('authenticated', 'public.claim_emails(integer, integer)', 'execute'),
  'only the service role may claim emails');

select * from finish();
rollback;

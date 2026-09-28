-- Telegram alerts about new products, reports and messages to a chosen account: what queues them,
-- what they say, and that they never carry a message. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users(id, email, created_at, raw_app_meta_data, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-000000000001', 'owner@alerts.test', now(), '{"provider": "email"}',
    '{"username": "tgowner"}'),
  ('a8000000-0000-4000-8000-000000000002', 'writer@alerts.test', now(), '{"provider": "email"}',
    '{"username": "tgwriter"}'),
  ('a8000000-0000-4000-8000-000000000003', 'other@alerts.test', now(), '{"provider": "email"}',
    '{"username": "tgother"}');
create temp view pgtap_alerts as
  select a.* from private.telegram_alerts a
  where a.user_id::text like 'a8000000-%' and a.kind <> 'signup';

-- The owner chooses the account by username, in the SQL editor.
select is(public.set_telegram_inbox(' @TGOwner ', true), 'a8000000-0000-4000-8000-000000000001'::uuid,
  'an account is chosen by its username, with or without @');
select throws_ok($$ select public.set_telegram_inbox('nobody-has-this', true) $$, 'P0002', null,
  'an unknown username is refused');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.set_telegram_inbox('tgowner', false) $$, '42501', null,
  'users cannot choose accounts');
reset role;

-- Messages to the chosen account: one alert per conversation until it is read. Messages to
-- anyone else, and the chosen account's own messages, queue nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000002', true);
select public.send_message('a8000000-0000-4000-8000-000000000001', 'Secret offer one');
select public.send_message('a8000000-0000-4000-8000-000000000001', 'Secret offer two');
select public.send_message('a8000000-0000-4000-8000-000000000003', 'Secret offer elsewhere');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select public.send_message('a8000000-0000-4000-8000-000000000002', 'Secret reply');
reset role;
select results_eq($$ select kind, user_id from pgtap_alerts $$,
  $$ values ('message'::text, 'a8000000-0000-4000-8000-000000000002'::uuid) $$,
  'two messages to the chosen account queue one alert, and other messages none');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select public.mark_conversation_read(c.id, (select max(m.created_at) from public.messages m
  where m.conversation_id = c.id))
from public.conversations c
where c.user_a in ('a8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002')
  and c.user_b in ('a8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000002', true);
select public.send_message('a8000000-0000-4000-8000-000000000001', 'Secret offer three');
reset role;
select is((select count(*)::int from pgtap_alerts where kind = 'message'), 2,
  'a message after the account read the conversation queues a new alert');

-- A new product and a new report each queue an alert.
insert into public.saas(id, owner_id, name, tagline, description, category, website) values
  ('a8000000-0000-4000-8000-0000000000a1', 'a8000000-0000-4000-8000-000000000002',
    'Alert Test Product', 'A product for the alert tests', 'A product that only the alert tests use.',
    'Other', 'https://alert-test.example');
select results_eq($$ select user_id, saas_id from pgtap_alerts where kind = 'saas' $$,
  $$ values ('a8000000-0000-4000-8000-000000000002'::uuid,
    'a8000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'a new product queues an alert');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select public.submit_report('message', m.id, 'spam', '') from public.messages m
where m.body = 'Secret offer one';
reset role;
select results_eq($$ select a.user_id, a.report_id from pgtap_alerts a where a.kind = 'report' $$,
  $$ select r.reporter_id, r.id from public.reports r
     where r.reporter_id = 'a8000000-0000-4000-8000-000000000001' $$,
  'a new report queues an alert');

-- What the worker reads for each.
create temp table pgtap_claimed (id bigint, kind text, user_id uuid, feedback_id uuid,
  context jsonb);
grant all on pgtap_claimed to service_role;
set local role service_role;
insert into pgtap_claimed
select * from public.claim_telegram_alerts(100)
where user_id::text like 'a8000000-%' and kind <> 'signup';
reset role;
select results_eq(
  $$ select distinct c.context ->> 'username', c.context ->> 'sender_id',
      (c.context ->> 'wanted')::boolean, (c.context ->> 'blocked')::boolean,
      (c.context ->> 'sender_suspended')::boolean
     from pgtap_claimed c where c.kind = 'message' $$,
  $$ values ('tgwriter'::text, 'a8000000-0000-4000-8000-000000000002'::text, true, false,
    false) $$,
  'a message alert names the sender, who may still be alerted about');
select results_eq(
  $$ select c.context ->> 'product', c.context ->> 'username', c.context ->> 'category',
      c.context ->> 'slug', (c.context ->> 'hidden')::boolean
     from pgtap_claimed c where c.kind = 'saas' $$,
  $$ select 'Alert Test Product'::text, 'tgwriter'::text, 'Other'::text, s.slug, false
     from public.saas s where s.id = 'a8000000-0000-4000-8000-0000000000a1' $$,
  'a product alert names the product, its founder and its page');
select results_eq(
  $$ select c.context ->> 'username', c.context ->> 'target', c.context ->> 'subject_name',
      c.context ->> 'reason', c.context ->> 'target_name'
     from pgtap_claimed c where c.kind = 'report' $$,
  $$ values ('tgowner'::text, 'message'::text, 'tgwriter'::text, 'spam'::text, null::text) $$,
  'a report alert says who reported what, and why');
select is_empty($$ select 1 from pgtap_claimed where context::text like '%Secret%'
    or context::text like '%@alerts.test%' $$,
  'no alert carries a message, even a reported one, or an email address');

-- Turned off, message alerts are not sent any more.
select public.set_telegram_inbox('tgowner', false);
select is((select (private.telegram_alert_context(a) ->> 'wanted')::boolean
    from private.telegram_alerts a
    where a.kind = 'message' and a.user_id = 'a8000000-0000-4000-8000-000000000002' limit 1),
  false, 'message alerts for an account that was turned off are not wanted');

-- Alerts go with the product, and with the sender's account.
delete from public.saas where id = 'a8000000-0000-4000-8000-0000000000a1';
select is_empty($$ select 1 from pgtap_alerts where kind = 'saas' $$,
  'deleting a product deletes its alert');
select private.remove_account('a8000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from pgtap_alerts $$,
  'deleting an account deletes the alerts about its messages and the reports about it');

select * from finish();
rollback;

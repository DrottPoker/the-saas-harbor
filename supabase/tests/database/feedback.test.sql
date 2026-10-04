-- Feedback: what users and visitors can send, the limits, who reads it, handling, account deletion
-- and how long a visitor's is kept. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users(id, email) values
  ('e4000000-0000-4000-8000-000000000001', 'user@feedback.test'),
  ('e4000000-0000-4000-8000-000000000002', 'admin@feedback.test'),
  ('e4000000-0000-4000-8000-000000000003', 'suspended@feedback.test');
insert into public.profiles(id, name) values
  ('e4000000-0000-4000-8000-000000000001', 'Feedback User'),
  ('e4000000-0000-4000-8000-000000000002', 'Feedback Admin'),
  ('e4000000-0000-4000-8000-000000000003', 'Feedback Suspended');
update public.profiles set suspended_at = now(), suspended_reason = 'spam'
  where id = 'e4000000-0000-4000-8000-000000000003';
insert into private.admins(user_id) values ('e4000000-0000-4000-8000-000000000002');

set local role anon;
select throws_ok($$ select public.submit_feedback('bug', 'The page did not load at all.', '/') $$,
  '42501', null, 'visitors cannot send feedback');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.submit_feedback('bug', '  The chart on my product page is empty.  ', '/dashboard') $$,
  'users send feedback');
select lives_ok(
  $$ select public.submit_feedback('suggestion', 'A dark mode for the badge would be nice.',
     '//evil.example/path') $$,
  'feedback from another site keeps no page');
select throws_ok($$ select public.submit_feedback('praise', 'This is not a kind we have.', null) $$,
  'P0001', 'Choose what kind of feedback it is', 'only bugs, suggestions and other feedback');
select throws_ok($$ select public.submit_feedback('other', 'Too short', null) $$,
  'P0001', 'Write at least 10 characters', 'feedback needs some words');
select is_empty($$ select 1 from public.feedback $$, 'users do not read feedback back');
select throws_ok(
  $$ select public.admin_set_feedback_handled(gen_random_uuid(), true) $$,
  '42501', 'Only admins can do this', 'users cannot handle feedback');
select lives_ok($$ select public.submit_feedback('other', 'Third message this hour.',
  '/' || chr(9) || '/evil.example') $$, 'a third message is fine');
select public.submit_feedback('other', 'Fourth message this hour.', null);
select public.submit_feedback('other', 'Fifth message this hour.', null);
select throws_ok($$ select public.submit_feedback('other', 'Sixth message this hour.', null) $$,
  'P0001', 'You have sent a lot of feedback. Try again later', 'five an hour at most');

select set_config('request.jwt.claim.sub', 'e4000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.submit_feedback('bug', 'Suspended but writing anyway.', null) $$,
  'P0001', 'Your account is suspended, so you cannot send feedback',
  'suspended accounts cannot send feedback');

-- Admins read everything and mark it handled, or new again.
select set_config('request.jwt.claim.sub', 'e4000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select kind, message, page from public.feedback where kind <> 'other' order by created_at, kind $$,
  $$ values ('bug'::text, 'The chart on my product page is empty.'::text, '/dashboard'::text),
    ('suggestion', 'A dark mode for the badge would be nice.', null) $$,
  'admins read the feedback, trimmed and with only site paths');
-- Browsers drop tabs and line breaks from an address, so /<tab>/evil.example would lead there.
select is((select page from public.feedback where message = 'Third message this hour.'),
  null::text, 'a page with a tab or line break is left out');
select lives_ok(
  $$ select public.admin_set_feedback_handled(
       (select id from public.feedback where kind = 'bug'), true) $$,
  'admins mark feedback handled');
select results_eq(
  $$ select handled_by from public.feedback where kind = 'bug' and handled_at is not null $$,
  $$ values ('e4000000-0000-4000-8000-000000000002'::uuid) $$,
  'handled feedback records when and by whom');
select lives_ok(
  $$ select public.admin_set_feedback_handled(
       (select id from public.feedback where kind = 'bug'), false) $$,
  'admins can mark it new again');
reset role;

select throws_ok($$ insert into public.feedback(user_id, kind, message, page)
  values ('e4000000-0000-4000-8000-000000000001', 'other', 'Written straight to the table.',
    '/' || chr(10) || '/evil.example') $$, '23514', null,
  'the table refuses such a page however it is written');

delete from auth.users where id = 'e4000000-0000-4000-8000-000000000001';
select is_empty($$ select 1 from public.feedback
  where user_id = 'e4000000-0000-4000-8000-000000000001' $$,
  'deleting the account removes its feedback');

-- Visitors send feedback through the server only, within their own limits and a shared one.
set local role anon;
select throws_ok($$ select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'bug',
  'Sign-up did not work for me.', '/auth', null) $$,
  '42501', null, 'visitors cannot send it to the database themselves');
reset role;
set local role authenticated;
select throws_ok($$ select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'bug',
  'Sign-up did not work for me.', '/auth', null) $$,
  '42501', null, 'nor can users');
reset role;
set local role service_role;
select lives_ok($$ select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'bug',
  ' Sign-up did not work for me. ', '/auth', ' Jane@Example.com ') $$,
  'the server sends a visitor''s feedback');
select throws_ok($$ select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'other',
  'Another message here.', null, 'not-an-address') $$,
  'P0001', 'Enter a valid email address, or leave it empty', 'a reply address must be one');
select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'other',
  'Second visitor message.', null, null);
select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'other',
  'Third visitor message.', null, null);
select throws_ok($$ select public.submit_visitor_feedback('203.0.113.7', 'Browser V', 'other',
  'Fourth visitor message.', null, null) $$,
  'P0001', 'You have sent a lot of feedback. Try again later', 'three an hour from one visitor');
select lives_ok($$ select public.submit_visitor_feedback('203.0.113.8', 'Browser W', 'other',
  'Another visitor writes.', null, null) $$, 'another visitor has limits of their own');
reset role;
select results_eq(
  $$ select message, page, reply_email, octet_length(visitor) from public.feedback
     where user_id is null and kind = 'bug' $$,
  $$ values ('Sign-up did not work for me.'::text, '/auth'::text, 'jane@example.com'::text, 16) $$,
  'a visitor''s feedback keeps a hash of the visitor, and the address in lower case');
select ok(
  (select private.telegram_alert_context(a) @> '{"visitor": true, "reply": true}'
     and not private.telegram_alert_context(a) ? 'reply_email'
   from private.telegram_alerts a join public.feedback f on f.id = a.feedback_id
   where a.user_id is null and f.kind = 'bug'),
  'it is alerted, saying only that a reply address is there');
-- Many visitors at once meet a limit for all of them together.
insert into public.feedback(visitor, kind, message)
select decode(lpad(to_hex(i), 32, '0'), 'hex'), 'other', 'Flood message number ' || i
from generate_series(1, 30) i;
set local role service_role;
select throws_ok($$ select public.submit_visitor_feedback('203.0.113.9', 'Browser X', 'other',
  'One more from someone new.', null, null) $$,
  'P0001', 'A lot of feedback came in just now. Try again later', 'all visitors share a limit too');
reset role;
select throws_ok($$ insert into public.feedback(user_id, visitor, kind, message)
  values ('e4000000-0000-4000-8000-000000000002', decode(repeat('01', 16), 'hex'), 'other',
    'Both a user and a visitor.') $$, '23514', null,
  'feedback comes from a user or from a visitor');
select ok(
  (select command like '%user_id is null%12 months%' from cron.job
   where jobname = 'harbor-feedback-retention'),
  'a visitor''s feedback is deleted after 12 months');

select * from finish();
rollback;

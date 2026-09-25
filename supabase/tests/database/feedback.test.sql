-- Feedback: what users can send, the limits, who reads it, handling, and account deletion. Runs
-- in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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
select lives_ok($$ select public.submit_feedback('other', 'Third message this hour.', null) $$,
  'a third message is fine');
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

delete from auth.users where id = 'e4000000-0000-4000-8000-000000000001';
select is_empty($$ select 1 from public.feedback
  where user_id = 'e4000000-0000-4000-8000-000000000001' $$,
  'deleting the account removes its feedback');

select * from finish();
rollback;

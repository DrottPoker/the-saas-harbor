-- Sign-in with Google: finishing a sign-up that has no username or accepted Terms yet, deleting
-- an account after a fresh Google sign-in, and removing sign-ups never finished. Runs in a
-- rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Google creates the users without a username or Terms version in their metadata, with the email
-- address confirmed.
insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data, created_at,
  email_confirmed_at) values
  ('e4000000-0000-4000-8000-000000000001', 'new@google.test',
   '{"provider": "google", "providers": ["google"]}', '{"full_name": "New User"}', now(), now()),
  ('e4000000-0000-4000-8000-000000000002', 'finished@google.test',
   '{"provider": "google", "providers": ["google"]}', '{}', now() - interval '30 days',
   now() - interval '30 days'),
  ('e4000000-0000-4000-8000-000000000003', 'stale@google.test',
   '{"provider": "google", "providers": ["google"]}', '{}', now() - interval '8 days',
   now() - interval '8 days'),
  ('e4000000-0000-4000-8000-000000000004', 'recent@google.test',
   '{"provider": "google", "providers": ["google"]}', '{}', now() - interval '6 days',
   now() - interval '6 days'),
  ('e4000000-0000-4000-8000-000000000005', 'email@google.test',
   '{"provider": "email", "providers": ["email"]}', '{}', now() - interval '30 days',
   now() - interval '30 days'),
  ('e4000000-0000-4000-8000-000000000006', 'images@google.test',
   '{"provider": "google", "providers": ["google"]}', '{}', now() - interval '30 days',
   now() - interval '30 days');
-- Email sign-ups with a username and the Terms, whose address was never confirmed.
insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data, created_at) values
  ('e4000000-0000-4000-8000-000000000007', 'unconfirmed@google.test',
   '{"provider": "email", "providers": ["email"]}',
   '{"username": "googletest-unconfirmed", "terms_version": "2026-09-27"}',
   now() - interval '8 days'),
  ('e4000000-0000-4000-8000-000000000008', 'pending@google.test',
   '{"provider": "email", "providers": ["email"]}',
   '{"username": "googletest-pending", "terms_version": "2026-09-27"}',
   now() - interval '2 days');
insert into storage.objects(bucket_id, name, owner_id) values
  ('profile-images', 'e4000000-0000-4000-8000-000000000006/photo.png',
   'e4000000-0000-4000-8000-000000000006');
insert into public.profiles(id, name, slug) values
  ('e4000000-0000-4000-8000-000000000002', 'googletest-done', 'googletest-done');

select is_empty(
  $$ select 1 from public.profiles where id = 'e4000000-0000-4000-8000-000000000001' $$,
  'a Google sign-up has no profile yet');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  json_build_object('sub', 'e4000000-0000-4000-8000-000000000001')::text, true);
select throws_ok($$ select public.complete_signup('googletest-new', null) $$,
  '22023', 'Accept the current Terms of Service', 'the Terms must be accepted');
select throws_ok(
  $$ select public.complete_signup('googletest-new', current_date + 1) $$,
  '22023', 'Accept the current Terms of Service', 'a future version is refused');
select throws_ok($$ select public.complete_signup('admin', '2026-09-25') $$,
  'P0001', 'username reserved', 'the username rules apply');
select throws_ok($$ select public.complete_signup('googletest-done', '2026-09-25') $$,
  'P0001', 'username taken', 'a username in use is refused');
select lives_ok($$ select public.complete_signup('googletest-new', '2026-09-25') $$,
  'a Google user finishes sign-up');
select throws_ok($$ select public.complete_signup('googletest-again', '2026-09-25') $$,
  'P0001', 'Sign-up is already finished', 'sign-up is finished only once');
reset role;

select results_eq(
  $$ select name, slug from public.profiles where id = 'e4000000-0000-4000-8000-000000000001' $$,
  $$ values ('googletest-new'::text, 'googletest-new'::text) $$,
  'the profile has the username as name and address');
select results_eq(
  $$ select version from private.terms_acceptances
     where user_id = 'e4000000-0000-4000-8000-000000000001' $$,
  $$ values ('2026-09-25'::date) $$,
  'the accepted version is recorded');
select ok(
  not has_function_privilege('anon', 'public.complete_signup(text, date)', 'execute'),
  'visitors cannot finish a sign-up');

-- Deleting the account after a fresh Google sign-in.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e4000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint - 600)))::text, true);
select throws_ok('select public.delete_account()', '42501',
  'Confirm it is you to delete your account', 'a Google sign-in older than five minutes is not enough');
select set_config('request.jwt.claims', json_build_object('sub', 'e4000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint - 5)))::text, true);
select lives_ok('select public.delete_account()',
  'a user deletes their account right after signing in with Google again');
select set_config('request.jwt.claims', '', true);
reset role;
select is_empty(
  $$ select 1 from auth.users where id = 'e4000000-0000-4000-8000-000000000001' $$,
  'the account is deleted');
select is_empty(
  $$ select 1 from private.terms_acceptances
     where user_id = 'e4000000-0000-4000-8000-000000000001' $$,
  'with its Terms record');

-- Sign-ups never finished: no profile, or an email address never confirmed, after seven days.
select is(private.delete_unfinished_signups(), 3, 'three unfinished sign-ups are removed');
select is_empty(
  $$ select 1 from auth.users where id = 'e4000000-0000-4000-8000-000000000003' $$,
  'a Google sign-up unfinished for more than seven days is deleted');
select is_empty(
  $$ select 1 from auth.users where id in ('e4000000-0000-4000-8000-000000000005',
     'e4000000-0000-4000-8000-000000000007') $$,
  'so are an email account without a profile and one whose address was never confirmed');
select is(public.check_username('googletest-unconfirmed'), null,
  'which frees its username');
select results_eq(
  $$ select count(*)::int from auth.users where id in ('e4000000-0000-4000-8000-000000000002',
     'e4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-000000000006',
     'e4000000-0000-4000-8000-000000000008') $$,
  $$ values (4) $$,
  'finished, recent and image-owning accounts stay, and one that may still confirm its address');

select * from finish();
rollback;

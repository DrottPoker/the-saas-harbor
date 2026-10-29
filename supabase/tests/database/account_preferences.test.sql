-- Private account choices are readable only by admins and disappear with Auth accounts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id, email, raw_user_meta_data) values
  ('ee000000-0000-4000-8000-000000000001', 'prefs@example.test', '{"locale":"ar","currency":"AED"}'),
  ('ee000000-0000-4000-8000-000000000002', 'old-prefs@example.test', '{}'),
  ('ee000000-0000-4000-8000-000000000009', 'admin-prefs@example.test', '{}');
insert into private.admins(user_id) values ('ee000000-0000-4000-8000-000000000009');

set local role anon;
select throws_ok($$ select * from public.admin_account_preferences('{}') $$,
  '42501', null, 'visitors cannot read preferences');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select * from public.admin_account_preferences(array['ee000000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', 'Only admins can do this', 'users cannot read preferences through the admin function');
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000009', true);
select results_eq($$ select locale, currency from public.admin_account_preferences(array['ee000000-0000-4000-8000-000000000001'::uuid]) $$,
  $$ values ('ar'::text, 'AED'::text) $$, 'admins read saved choices without requiring a profile');
select results_eq($$ select locale, currency from public.admin_account_preferences(array['ee000000-0000-4000-8000-000000000002'::uuid]) $$,
  $$ values (null::text, null::text) $$, 'older accounts have no invented defaults');
select is_empty($$ select * from public.admin_account_preferences('{}') $$, 'an empty list returns no accounts');
select is_empty($$ select * from public.admin_account_preferences(array['ee000000-0000-4000-8000-000000000099'::uuid]) $$,
  'missing accounts are omitted');
select is((select count(*) from public.admin_account_preferences(array['ee000000-0000-4000-8000-000000000001'::uuid])),
  1::bigint, 'only requested accounts are returned');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', 'ee000000-0000-4000-8000-000000000001',
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now()))))::text, true);
select lives_ok($$ select public.delete_account() $$, 'the user deletes their own account');
reset role;
select is_empty($$ select raw_user_meta_data from auth.users where id = 'ee000000-0000-4000-8000-000000000001' $$,
  'account deletion removes stored preferences');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000009', true);
select is_empty($$ select * from public.admin_account_preferences(array['ee000000-0000-4000-8000-000000000001'::uuid]) $$,
  'deleted preferences cannot be read by admins');

select * from finish();
rollback;

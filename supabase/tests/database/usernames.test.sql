-- Usernames: the rules, sign-up creating the profile, changing a username, and profiles made
-- without one. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- The rules.
select is(public.check_username('ab'), 'format', 'at least 3 characters');
select is(public.check_username('Victor'), 'format', 'lowercase only; the app lowercases first');
select is(public.check_username('-victor'), 'format', 'no hyphen at the start');
select is(public.check_username('vic--tor'), 'format', 'no double hyphens');
select is(public.check_username(repeat('a', 31)), 'format', 'at most 30 characters');
select is(public.check_username('admin'), 'reserved', 'official-looking names are reserved');
select is(public.check_username('usertest-free'), null, 'a free, valid username is fine');

-- Sign-up with a username creates the profile, with the username as name and address.
insert into auth.users(id, email, raw_user_meta_data) values
  ('e3000000-0000-4000-8000-000000000001', 'first@usernames.test', '{"username": "usertest-one"}'),
  ('e3000000-0000-4000-8000-000000000002', 'second@usernames.test', '{"username": "usertest-one"}'),
  ('e3000000-0000-4000-8000-000000000003', 'third@usernames.test', '{"username": "admin"}'),
  ('e3000000-0000-4000-8000-000000000004', 'fourth@usernames.test', '{}');
select results_eq(
  $$ select name, slug from public.profiles where id = 'e3000000-0000-4000-8000-000000000001' $$,
  $$ values ('usertest-one'::text, 'usertest-one'::text) $$,
  'sign-up creates the profile with the username as name and address');
select results_eq(
  $$ select name, slug ~ '^usertest-one-[0-9]+$' from public.profiles
     where id = 'e3000000-0000-4000-8000-000000000002' $$,
  $$ values ('usertest-one'::text, true) $$,
  'a username taken in the meantime still gets a profile, at the next free address');
select is_empty(
  $$ select 1 from public.profiles where id in ('e3000000-0000-4000-8000-000000000003',
     'e3000000-0000-4000-8000-000000000004') $$,
  'a reserved or missing username creates no profile, and sign-up goes on');
select is(public.check_username('usertest-one'), 'taken', 'a username in use is taken');

-- Changing a username.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3000000-0000-4000-8000-000000000001', true);
select is(public.check_username('usertest-one'), null, 'your own username is not taken for you');
select lives_ok($$ select public.set_username('usertest-renamed') $$, 'users change their username');
select is((select slug from public.profiles where id = 'e3000000-0000-4000-8000-000000000001'),
  'usertest-renamed', 'the address follows the new username');
select throws_ok($$ select public.set_username('usertest-one-2') $$, 'P0001', 'username locked',
  'after a change, the next one waits');
select ok(public.username_change_available_at() between now() + interval '29 days'
  and now() + interval '31 days', 'the username can be changed again in 30 days');
select lives_ok($$ select public.set_username('usertest-renamed') $$,
  'saving the same username is not a change');
reset role;
update private.username_changes set changed_at = now() - interval '31 days'
  where user_id = 'e3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3000000-0000-4000-8000-000000000001', true);
select is(public.username_change_available_at(), null, '30 days later it can be changed again');
select throws_ok($$ select public.set_username('usertest-one-2') $$, 'P0001', 'username taken',
  'another user''s username is refused');
reset role;
select ok(not has_table_privilege('authenticated', 'private.username_changes', 'select'),
  'users cannot read or reset the record of changes');
set local role anon;
select throws_ok($$ select public.set_username('usertest-anon') $$, '42501', null,
  'visitors cannot set a username');
reset role;

delete from auth.users where id = 'e3000000-0000-4000-8000-000000000001';
select is_empty($$ select 1 from private.username_changes
  where user_id = 'e3000000-0000-4000-8000-000000000001' $$,
  'deleting the account removes the record of changes');

-- Profiles made without a username get an address from the name, without accents.
insert into auth.users(id) values ('e3000000-0000-4000-8000-000000000005');
insert into public.profiles(id, name) values ('e3000000-0000-4000-8000-000000000005',
  'Usertest Zoë Ångström');
select is((select slug from public.profiles where id = 'e3000000-0000-4000-8000-000000000005'),
  'usertest-zoe-angstrom', 'a profile made without a username gets one from its name');

select * from finish();
rollback;

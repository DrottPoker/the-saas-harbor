-- The country of the latest sign-in: recorded by the signed-in user only, shown to admins only,
-- and removed with the account. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id, email) values
  ('f2000000-0000-4000-8000-000000000001', 'traveller@country.test'),
  ('f2000000-0000-4000-8000-000000000002', 'admin@country.test');
insert into private.admins(user_id) values ('f2000000-0000-4000-8000-000000000002');

-- Visitors cannot record a country.
set local role anon;
select throws_ok($$ select public.record_sign_in_country('SE') $$, '42501', null,
  'visitors cannot record a country');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000001', true);
do $$ begin
  perform public.record_sign_in_country('SE');
  perform public.record_sign_in_country('se');
  perform public.record_sign_in_country('Sweden');
  perform public.record_sign_in_country(null);
end $$;
select throws_ok($$ select * from public.admin_account('f2000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'only admins see an account''s country');

reset role;
select results_eq(
  $$ select country from private.sign_in_countries
     where user_id = 'f2000000-0000-4000-8000-000000000001' $$,
  $$ values ('SE'::text) $$,
  'a two-letter code is recorded for the signed-in user; anything else is ignored');

-- A later sign-in replaces the country and its time.
update private.sign_in_countries set signed_in_at = now() - interval '1 day';
set local role authenticated;
do $$ begin perform public.record_sign_in_country('NO'); end $$;
reset role;
select results_eq(
  $$ select country, signed_in_at = now() from private.sign_in_countries $$,
  $$ values ('NO'::text, true) $$,
  'the latest sign-in replaces the country');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select country from public.admin_account('f2000000-0000-4000-8000-000000000001') $$,
  $$ values ('NO'::text) $$,
  'admins see the country on the account page');
select results_eq(
  $$ select country from public.admin_account('f2000000-0000-4000-8000-000000000002') $$,
  $$ values (null::text) $$,
  'an account without a recorded country shows none');

-- Only signed-in users record a country, and only through the function.
reset role;
select ok(not has_function_privilege('anon', 'public.record_sign_in_country(text)', 'execute'),
  'anon has no execute privilege');
select ok(not has_function_privilege('service_role', 'public.record_sign_in_country(text)',
  'execute'), 'the service role has no execute privilege');
select ok(not has_table_privilege('authenticated', 'private.sign_in_countries', 'select'),
  'users cannot read the recorded countries');
select ok(not has_table_privilege('authenticated', 'private.sign_in_countries', 'insert'),
  'users cannot write the table directly');

-- Deleting the account removes its country.
delete from auth.users where id = 'f2000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select 1 from private.sign_in_countries
     where user_id = 'f2000000-0000-4000-8000-000000000001' $$,
  'deleting the account removes its country');
select ok(exists (select 1 from auth.users where id = 'f2000000-0000-4000-8000-000000000002'),
  'other accounts stay');

select * from finish();
rollback;

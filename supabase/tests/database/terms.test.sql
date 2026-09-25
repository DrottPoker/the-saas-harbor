-- The record of accepted Terms of Service: written when Auth creates a user with the version in
-- its metadata, nothing for a missing or impossible version, out of reach of the API roles, and
-- removed with the account. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, email, raw_user_meta_data, created_at) values
  ('f1000000-0000-4000-8000-000000000001', 'accepted@terms.test',
   '{"terms_version": "2026-09-25"}', '2026-09-26 08:00:00+00'),
  ('f1000000-0000-4000-8000-000000000002', 'none@terms.test', '{}', now()),
  ('f1000000-0000-4000-8000-000000000003', 'impossible@terms.test',
   '{"terms_version": "2026-13-45"}', now()),
  ('f1000000-0000-4000-8000-000000000004', 'text@terms.test',
   '{"terms_version": "yes please"}', now());

select results_eq(
  $$ select version, accepted_at from private.terms_acceptances
     where user_id = 'f1000000-0000-4000-8000-000000000001' $$,
  $$ values ('2026-09-25'::date, '2026-09-26 08:00:00+00'::timestamptz) $$,
  'sign-up records the accepted version and when the account was created');
select is_empty(
  $$ select 1 from private.terms_acceptances
     where user_id <> 'f1000000-0000-4000-8000-000000000001'
       and user_id::text like 'f1000000-%' $$,
  'no version, an impossible date or any other text records nothing');
select ok(
  exists (select 1 from auth.users where id = 'f1000000-0000-4000-8000-000000000003'),
  'an impossible version does not stop the sign-up');

select ok(not has_table_privilege('anon', 'private.terms_acceptances', 'select'),
  'visitors cannot read the record');
select ok(not has_table_privilege('authenticated', 'private.terms_acceptances', 'select')
  and not has_table_privilege('authenticated', 'private.terms_acceptances', 'insert'),
  'users cannot read or write the record');
select ok(
  not has_function_privilege('authenticated', 'private.record_terms_acceptance()', 'execute'),
  'users cannot call the trigger function');

delete from auth.users where id = 'f1000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select 1 from private.terms_acceptances
     where user_id = 'f1000000-0000-4000-8000-000000000001' $$,
  'deleting the account removes the record');

select * from finish();
rollback;

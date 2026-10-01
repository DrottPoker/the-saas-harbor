-- IndexNow notices: at most one an hour per product, only for its founder, and gone with the
-- product. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id) values
  ('ec100000-0000-4000-8000-000000000001'),
  ('ec100000-0000-4000-8000-000000000002');
insert into public.profiles(id, name) values
  ('ec100000-0000-4000-8000-000000000001', 'Notice Founder'),
  ('ec100000-0000-4000-8000-000000000002', 'Notice Other');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ec100000-0000-4000-8000-000000000001', true);
select public.save_saas('ec200000-0000-4000-8000-000000000001', 'Notice Product',
  'Notice fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select ok(public.claim_index_notice('ec200000-0000-4000-8000-000000000001'),
  'the founder''s first save announces the page');
select ok(not public.claim_index_notice('ec200000-0000-4000-8000-000000000001'),
  'another save within the hour does not');

select set_config('request.jwt.claim.sub', 'ec100000-0000-4000-8000-000000000002', true);
reset role;
update private.index_notices set sent_at = now() - interval '61 minutes'
  where saas_id = 'ec200000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.claim_index_notice('ec200000-0000-4000-8000-000000000001'),
  'another user cannot announce the product');
select set_config('request.jwt.claim.sub', 'ec100000-0000-4000-8000-000000000001', true);
select ok(public.claim_index_notice('ec200000-0000-4000-8000-000000000001'),
  'the founder announces it again after an hour');
select throws_ok('select count(*) from private.index_notices', '42501', null,
  'users cannot read the notices');
reset role;

set local role anon;
select throws_ok($$ select public.claim_index_notice('ec200000-0000-4000-8000-000000000001') $$,
  '42501', null, 'visitors cannot announce pages');
reset role;

delete from public.saas where id = 'ec200000-0000-4000-8000-000000000001';
select is_empty($$ select 1 from private.index_notices
  where saas_id = 'ec200000-0000-4000-8000-000000000001' $$,
  'the notice time goes with the product');

select * from finish();
rollback;

-- A founder whose payment provider is not supported names it under Other. Only they read the
-- name; admins see the names counted, beside the providers products are connected to. Runs in a
-- rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'maker@payment-providers.test'),
  ('f1000000-0000-4000-8000-000000000002', 'other@payment-providers.test'),
  ('f1000000-0000-4000-8000-000000000003', 'admin@payment-providers.test');
insert into public.profiles(id, name) values
  ('f1000000-0000-4000-8000-000000000001', 'Payment Providers Maker'),
  ('f1000000-0000-4000-8000-000000000002', 'Payment Providers Other'),
  ('f1000000-0000-4000-8000-000000000003', 'Payment Providers Admin');
insert into private.admins(user_id) values ('f1000000-0000-4000-8000-000000000003');

-- Products with neither a connection nor a name before the fixtures, to count the fixtures'.
create temp table counted_before as
select count(*) as none from public.saas s
where not exists (select 1 from public.revenue_connections c where c.saas_id = s.id)
  and not exists (
    select 1 from public.saas_settings st where st.saas_id = s.id and st.other_provider is not null
  );
grant select on counted_before to authenticated;

-- Two products name the same provider, spelled two ways; one names another; one is connected
-- although it once named a provider; one has neither.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.save_saas('f1100000-0000-4000-8000-000000000001', 'Named', 'Fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
    false, false, null, 'Harbor Test Pay') $$,
  'a founder names a provider that is not supported');
select is(
  (select other_provider from public.saas_settings
   where saas_id = 'f1100000-0000-4000-8000-000000000001'),
  'Harbor Test Pay', 'the name is kept with the product''s settings');
select public.save_saas('f1100000-0000-4000-8000-000000000002', 'Named Again', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false, null, 'harbor test pay');
select public.save_saas('f1100000-0000-4000-8000-000000000003', 'Named Too', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false, null, 'Harbor Test Pay');
select public.save_saas('f1100000-0000-4000-8000-000000000004', 'Named Else', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false, null, 'Harbor Other Pay');
-- The other founder's, within the daily limit of products.
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select public.save_saas('f1100000-0000-4000-8000-000000000005', 'Connected', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false, null, 'Harbor Connected Pay');
select public.save_saas('f1100000-0000-4000-8000-000000000006', 'Neither', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);

-- Only a trimmed name of 1 to 60 characters is stored.
select throws_ok(
  $$ select public.save_saas('f1100000-0000-4000-8000-000000000006', 'Neither', 'Fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
    false, false, null, ' Padded ') $$,
  '23514', null, 'a name with spaces around it is refused');
select throws_ok(
  $$ select public.save_saas('f1100000-0000-4000-8000-000000000006', 'Neither', 'Fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
    false, false, null, '') $$,
  '23514', null, 'an empty name is refused');
select throws_ok(
  $$ select public.save_saas('f1100000-0000-4000-8000-000000000006', 'Neither', 'Fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
    false, false, null, repeat('x', 61)) $$,
  '23514', null, 'a name over 60 characters is refused');

-- Nobody else reads it.
select is_empty(
  $$ select other_provider from public.saas_settings
     where saas_id = 'f1100000-0000-4000-8000-000000000001' $$,
  'another founder cannot read the name');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok('select other_provider from public.saas_settings', '42501', null,
  'visitors cannot read it');

set local role service_role;
select public.record_revenue_verification('f1100000-0000-4000-8000-000000000005', 'stripe',
  'v1:providers', 'rk_live_…prov', true, 100, 1, '{"usd": 100}', null, '{}', null, null, null);

-- Nobody but admins sees the counts, or each product's name.
select throws_ok('select * from public.admin_payment_providers()', '42501', null,
  'the service role does not use the admin function');
select throws_ok(
  $$ select * from public.admin_other_providers(array['f1100000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', null, 'nor the one for each product');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select throws_ok('select * from public.admin_payment_providers()', '42501',
  'Only admins can do this', 'founders cannot read the counts');
select throws_ok(
  $$ select * from public.admin_other_providers(array['f1100000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', 'Only admins can do this', 'nor the names, even their own');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
select results_eq(
  $$ select name, products from public.admin_payment_providers()
     where kind = 'other' and name like 'Harbor %' order by products desc, name $$,
  $$ values ('Harbor Test Pay'::text, 3::bigint), ('Harbor Other Pay', 1) $$,
  'admins see each name once, as most products spell it, without connected products');
select ok(
  (select products >= 1 from public.admin_payment_providers()
   where kind = 'connected' and name = 'stripe'),
  'and the providers products are connected to');
select is(
  (select products from public.admin_payment_providers() where kind = 'none'),
  (select none + 1 from counted_before), 'and how many products have neither');
select results_eq(
  $$ select saas_id, name from public.admin_other_providers(array[
       'f1100000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000002',
       'f1100000-0000-4000-8000-000000000005', 'f1100000-0000-4000-8000-000000000006']::uuid[])
     order by saas_id $$,
  $$ values ('f1100000-0000-4000-8000-000000000001'::uuid, 'Harbor Test Pay'::text),
       ('f1100000-0000-4000-8000-000000000002'::uuid, 'harbor test pay') $$,
  'admins read each asked-for product''s name as written, without connected products');
select is_empty($$ select * from public.admin_other_providers('{}') $$, 'no products, no names');

-- Choosing a supported provider, or one connected, clears the name.
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select public.save_saas('f1100000-0000-4000-8000-000000000004', 'Named Else', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
select is(
  (select other_provider from public.saas_settings
   where saas_id = 'f1100000-0000-4000-8000-000000000004'),
  null, 'a save without a name clears it');

-- Deleting the product removes the name with its settings.
delete from public.saas where id = 'f1100000-0000-4000-8000-000000000001';
set local role postgres;
select is_empty(
  $$ select 1 from public.saas_settings where saas_id = 'f1100000-0000-4000-8000-000000000001' $$,
  'deleting the product removes the name');

select * from finish();
rollback;

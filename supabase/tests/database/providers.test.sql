-- Revenue connections name their payment provider, which the snapshot and the public projection
-- repeat. A new key may switch the provider; a re-verification must come from the connected one.
-- Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id) values ('c7000000-0000-4000-8000-000000000001');
insert into public.profiles(id, name) values ('c7000000-0000-4000-8000-000000000001', 'Provider Maker');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000001', true);
select public.save_saas('c7100000-0000-4000-8000-000000000001', 'Provider Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);

set local role service_role;
select lives_ok(
  $$ select public.record_revenue_verification('c7100000-0000-4000-8000-000000000001', 'paddle',
    'v1:paddle', 'pdl_sdbx_apikey_…abc', false, 4200, 3, '{"usd": 4200}', null,
    array[repeat('d', 64)], null, null, null) $$,
  'the server records a Paddle verification');
select is(
  (select provider from public.revenue_connections
    where saas_id = 'c7100000-0000-4000-8000-000000000001'),
  'paddle', 'the connection names its provider');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select provider from public.public_saas where id = 'c7100000-0000-4000-8000-000000000001'),
  'paddle', 'visitors see which provider verified the figures');

set local role service_role;
select throws_ok(
  $$ select public.record_revenue_verification('c7100000-0000-4000-8000-000000000001', 'polar',
    null, null, true, 1, 1, '{}', null, '{}', null, null, null) $$,
  'P0002', 'The product is not connected to this provider',
  'a re-verification from another provider is refused');
select lives_ok(
  $$ select public.record_revenue_verification('c7100000-0000-4000-8000-000000000001', 'polar',
    'v1:polar', 'polar_oat_…xyz', true, 9900, 5, '{"usd": 9900}', null,
    array[repeat('e', 64)], null, null, null) $$,
  'a new key switches the provider');
select results_eq(
  $$ select c.provider, c.key_hint, s.provider
     from public.revenue_connections c
     join lateral (select provider from public.revenue_snapshots
       where saas_id = c.saas_id order by captured_at desc, seq desc limit 1) s on true
     where c.saas_id = 'c7100000-0000-4000-8000-000000000001' $$,
  $$ values ('polar'::text, 'polar_oat_…xyz'::text, 'polar'::text) $$,
  'the connection and the new snapshot name the new provider');
select is(
  (select count(*)::int from private.subscription_claims
    where saas_id = 'c7100000-0000-4000-8000-000000000001' and subscription_hash = repeat('d', 64)),
  0, 'the old provider''s claims are released');
select throws_ok(
  $$ select public.record_revenue_verification('c7100000-0000-4000-8000-000000000001', 'lemon',
    'v1:lemon', 'x', true, 1, 1, '{}', null, '{}', null, null, null) $$,
  '23514', null, 'only the supported providers are accepted');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000001', true);
select is(
  (select provider from public.revenue_connections
    where saas_id = 'c7100000-0000-4000-8000-000000000001'),
  'polar', 'the owner reads the provider of their connection');

select * from finish();
rollback;

-- Grants, RLS, storage ownership, verified revenue and ranking. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users(id) values
  ('b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002');

-- Owner one: three products with different visibility choices.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000001', 'SQL Test Private',
    'Private fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, '2026-01-01', false, false, false) $$,
  'owner saves a SaaS that keeps revenue private'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000002', 'SQL Test Small',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, null, true, false, false) $$,
  'owner saves a SaaS that shares MRR'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000003', 'SQL Test Large',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, '2025-05-05', true, true, true) $$,
  'owner saves a SaaS that shares MRR, customers and launch date'
);

-- Makers can never write verified figures or read the stored key.
select throws_ok(
  $$ insert into public.revenue_snapshots(saas_id, owner_id, mrr_cents, customers, livemode)
    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 1, 1, true) $$,
  '42501', null, 'owner cannot insert a revenue snapshot'
);
select throws_ok(
  $$ update public.public_metrics set mrr_cents = 1 where saas_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'owner cannot write the public projection'
);
select throws_ok(
  $$ insert into public.stripe_connections(saas_id, owner_id, encrypted_key, key_hint, livemode)
    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'v1:x', 'x', true) $$,
  '42501', null, 'owner cannot create a Stripe connection directly'
);
select throws_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000002', null, null,
    true, 999999, 1, '{}', null, '{}') $$,
  '42501', null, 'owner cannot record a verification'
);
select throws_ok(
  $$ select private.refresh_public_metrics('c0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'owner cannot call the private refresh function'
);
select throws_ok(
  'select count(*) from private.stripe_subscription_claims',
  '42501', null, 'owner cannot read subscription claims'
);
select lives_ok(
  $$ insert into storage.objects(bucket_id, name)
    values ('profile-images', 'b0000000-0000-4000-8000-000000000001/own.png') $$,
  'owner uploads into own image folder'
);
select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
    values ('profile-images', 'b0000000-0000-4000-8000-000000000002/forged.png') $$,
  '42501', null, 'owner cannot upload into another user''s image folder'
);
select throws_ok(
  $$ update public.saas set owner_id = 'b0000000-0000-4000-8000-000000000002'
    where id = 'c0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'owner cannot transfer a SaaS to another user'
);

-- The trusted server records verified revenue.
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000001', 'v1:private',
    'rk_live_…0001', true, 99999900, 99, '{"usd": 99999900}', null,
    array[repeat('a', 64)]) $$,
  'server verifies the private product'
);
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000002', 'v1:small',
    'rk_live_…0002', true, 1999, 1, '{"usd": 1999}', null, array[repeat('b', 64)]) $$,
  'server verifies the small product'
);
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000003', 'v1:large',
    'rk_live_…0003', true, 100000, 2, '{"usd": 100000}', null, array[repeat('c', 64)]) $$,
  'server verifies the large product'
);
select throws_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000003', null, null,
    true, 100000, 2, '{}', null, array[repeat('a', 64), repeat('c', 64)]) $$,
  '23505', null, 'a subscription cannot verify two products'
);
select throws_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000009', null, null,
    true, 1, 1, '{}', null, '{}') $$,
  'P0002', null, 'verification requires an existing SaaS'
);

-- Owner one reads its own history and connection status, but never the key.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.revenue_snapshots), 3, 'owner reads own verified history');
select is(
  (select status from public.stripe_connections where saas_id = 'c0000000-0000-4000-8000-000000000002'),
  'ok', 'owner reads own connection status'
);
select throws_ok(
  'select encrypted_key from public.stripe_connections',
  '42501', null, 'owner cannot read the encrypted key'
);

-- Owner two sees and changes nothing of owner one's.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select is_empty('select * from public.revenue_snapshots', 'another owner cannot read verified history');
select is_empty('select saas_id from public.stripe_connections', 'another owner cannot see connections');
select is_empty('select * from public.saas_settings', 'another owner cannot read settings');
with changed as (
  update public.saas_settings set share_mrr = true
  where saas_id = 'c0000000-0000-4000-8000-000000000001' returning saas_id
)
select is(count(*)::int, 0, 'another owner cannot change visibility') from changed;
select throws_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000001', 'Hijacked',
    'Foreign edit attempt', 'A foreign owner should never change this product.', 'Other',
    'https://example.com', null, null, true, true, true) $$,
  '42501', null, 'another owner cannot save through the RPC'
);

-- Anonymous visitors.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*)::int from public.public_saas where id::text like 'c0000000-%'),
  3, 'every product is listed'
);
select results_eq(
  $$ select mrr_cents, customers, launched_on, revenue_status from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values (null::bigint, null::integer, null::date, 'private'::text) $$,
  'private verified figures and launch date stay hidden'
);
select results_eq(
  $$ select mrr_cents, customers, launched_on, revenue_status from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000003' $$,
  $$ values (100000::bigint, 2, '2025-05-05'::date, 'verified'::text) $$,
  'shared verified figures and launch date are public'
);
select is(
  (select array_agg(id order by rank) from public.leaderboard where id::text like 'c0000000-%'),
  array['c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002']::uuid[],
  'leaderboard ranks shared verified MRR numerically'
);
select throws_ok('select count(*) from public.revenue_snapshots', '42501', null,
  'anonymous visitors cannot read verified history');
select throws_ok('select count(*) from public.stripe_connections', '42501', null,
  'anonymous visitors cannot read connections');
select ok(
  not has_function_privilege('anon',
    'public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean)', 'execute'),
  'anonymous visitors cannot execute save_saas'
);

-- Owner one hides MRR on one product; the server records zero MRR on another.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_mrr = false where saas_id = 'c0000000-0000-4000-8000-000000000003';
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000002', null, null,
    true, 0, 0, '{}', null, array[repeat('b', 64)]) $$,
  'server records zero MRR'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is_empty(
  $$ select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'hidden MRR leaves the leaderboard'
);
select is(
  (select customers from public.public_saas where id = 'c0000000-0000-4000-8000-000000000003'),
  2, 'customer visibility is independent of MRR visibility'
);
select isnt_empty(
  $$ select 1 from public.leaderboard
    where id = 'c0000000-0000-4000-8000-000000000002' and mrr_cents = 0 $$,
  'zero verified MRR is ranked'
);

-- Stale verifications and disconnections. Ageing a snapshot needs the table owner.
reset role;
update public.revenue_snapshots set captured_at = now() - interval '8 days'
  where saas_id = 'c0000000-0000-4000-8000-000000000002';
select private.refresh_public_metrics('c0000000-0000-4000-8000-000000000002');
set local role service_role;
delete from public.stripe_connections where saas_id = 'c0000000-0000-4000-8000-000000000001';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select mrr_cents, revenue_status from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000002' $$,
  $$ values (null::bigint, 'stale'::text) $$,
  'a verification older than seven days is hidden and marked stale'
);
select is_empty(
  $$ select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000002' $$,
  'stale revenue is not ranked'
);
select is(
  (select revenue_status from public.public_saas where id = 'c0000000-0000-4000-8000-000000000001'),
  'unverified', 'disconnecting Stripe removes the verification'
);

set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000003', null, null,
    true, 100000, 2, '{}', null, array[repeat('a', 64), repeat('c', 64)]) $$,
  'subscriptions released by a disconnect can verify another product'
);
select lives_ok(
  $$ delete from public.saas where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'deleting a connected SaaS cascades cleanly'
);

reset role;
select * from finish();
rollback;

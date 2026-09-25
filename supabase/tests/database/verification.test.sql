-- Hourly verification: a re-verification replaces the day's snapshot, a new day or a new key adds
-- one, and the scheduled run claims only connections that are due, oldest first. Runs in a
-- rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Existing local connections count as just checked, so only the fixtures are due.
update public.revenue_connections set last_checked_at = now();

insert into auth.users(id) values ('d7000000-0000-4000-8000-000000000001');
insert into public.profiles(id, name) values ('d7000000-0000-4000-8000-000000000001', 'Hourly Maker');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000001', true);
select public.save_saas('d7100000-0000-4000-8000-000000000001', 'Hourly One', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
select public.save_saas('d7100000-0000-4000-8000-000000000002', 'Hourly Two', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);

set local role service_role;
select public.record_revenue_verification('d7100000-0000-4000-8000-000000000001', 'stripe',
  'v1:one', 'rk_live_…one1', true, 1000, 1, '{"usd": 1000}', null, array[repeat('1', 64)],
  '[{"month": "2026-08", "mrr_cents": 900}]', 900, 800, now() - interval '2 hours');
select public.record_revenue_verification('d7100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 1500, 2, '{"usd": 1500}', null, array[repeat('1', 64)],
  '[{"month": "2026-08", "mrr_cents": 900}]', 900, 800, now() - interval '2 hours');

set local role postgres;
select is((select count(*)::int from public.revenue_snapshots
  where saas_id = 'd7100000-0000-4000-8000-000000000001'), 1,
  'a re-verification the same day replaces the day''s snapshot');
select results_eq(
  $$ select mrr_cents, customers, history_at < now() - interval '1 hour'
     from public.revenue_snapshots where saas_id = 'd7100000-0000-4000-8000-000000000001' $$,
  $$ values (1500::bigint, 2, true) $$,
  'the snapshot holds the new figures and when its history was read');
select is((select mrr_cents from public.public_metrics
  where saas_id = 'd7100000-0000-4000-8000-000000000001'), 1500::bigint,
  'a replaced snapshot updates the public projection');

-- A snapshot from yesterday stays; today's verification adds one.
update public.revenue_snapshots set captured_at = now() - interval '1 day'
where saas_id = 'd7100000-0000-4000-8000-000000000001';
set local role service_role;
select public.record_revenue_verification('d7100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 1600, 2, '{"usd": 1600}', null, array[repeat('1', 64)], null, null, null,
  null);
set local role postgres;
select is((select count(*)::int from public.revenue_snapshots
  where saas_id = 'd7100000-0000-4000-8000-000000000001'), 2,
  'a new day starts a new snapshot');

-- A new key starts a new snapshot even on the same day.
set local role service_role;
select public.record_revenue_verification('d7100000-0000-4000-8000-000000000001', 'stripe',
  'v1:two', 'rk_live_…two2', true, 1700, 2, '{"usd": 1700}', null, array[repeat('1', 64)], null,
  null, null, null);
set local role postgres;
select is((select count(*)::int from public.revenue_snapshots
  where saas_id = 'd7100000-0000-4000-8000-000000000001'), 3,
  'a new key starts a new snapshot');
select is((select mrr_cents from public.public_metrics
  where saas_id = 'd7100000-0000-4000-8000-000000000001'), 1700::bigint,
  'the projection follows the latest snapshot');

-- The scheduled run claims connections not verified or checked within the interval.
set local role service_role;
select public.record_revenue_verification('d7100000-0000-4000-8000-000000000002', 'stripe',
  'v1:three', 'rk_live_…thr3', true, 100, 1, '{"usd": 100}', null, array[repeat('2', 64)], null,
  null, null, null);
set local role postgres;
update public.revenue_connections set last_synced_at = now() - interval '3 hours',
  last_checked_at = null
where saas_id = 'd7100000-0000-4000-8000-000000000001';
update public.revenue_connections set last_synced_at = now() - interval '2 hours',
  last_checked_at = now() - interval '90 minutes'
where saas_id = 'd7100000-0000-4000-8000-000000000002';
set local role service_role;
select results_eq(
  $$ select * from public.claim_due_connections(1, interval '55 minutes') $$,
  $$ values ('d7100000-0000-4000-8000-000000000001'::uuid) $$,
  'the connection verified longest ago comes first, up to the limit');
select results_eq(
  $$ select * from public.claim_due_connections(10, interval '55 minutes') $$,
  $$ values ('d7100000-0000-4000-8000-000000000002'::uuid) $$,
  'a claimed connection is not claimed again');
select is_empty($$ select * from public.claim_due_connections(10, interval '55 minutes') $$,
  'nothing is due until an hour has passed');
set local role postgres;
select ok((select last_checked_at > now() - interval '1 minute' from public.revenue_connections
  where saas_id = 'd7100000-0000-4000-8000-000000000002'),
  'claiming marks the connection checked');
update public.revenue_connections set last_synced_at = now(), last_checked_at = null
where saas_id = 'd7100000-0000-4000-8000-000000000002';
set local role service_role;
select is_empty($$ select * from public.claim_due_connections(10, interval '55 minutes') $$,
  'a connection verified within the hour is not due');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.claim_due_connections(10, interval '1 minute') $$, '42501', null,
  'makers cannot claim connections');
select throws_ok(
  $$ select public.record_revenue_verification('d7100000-0000-4000-8000-000000000001', 'stripe',
    null, null, true, 1, 1, '{}', null, '{}', null, null, null, null) $$,
  '42501', null, 'makers cannot record a verification');

select * from finish();
rollback;

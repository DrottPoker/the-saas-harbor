-- Revenue from payments: payments are stored per connection and claimed by one product, the
-- figures follow the founder's sharing choice and rank products per window, a new key starts
-- over, and the scheduled run reads payments daily, or hourly until they reach the first one.
-- Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Existing local connections count as just checked, so only the fixtures are due.
update public.revenue_connections set last_checked_at = now(), revenue_checked_at = now();

insert into auth.users(id) values ('e8000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000002');
insert into public.profiles(id, name) values ('e8000000-0000-4000-8000-000000000001', 'Revenue One'),
  ('e8000000-0000-4000-8000-000000000002', 'Revenue Two');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
select public.save_saas('e8100000-0000-4000-8000-000000000001', 'Revenue Alpha', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
select public.save_saas('e8100000-0000-4000-8000-000000000002', 'Revenue Beta', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, false,
  false, false, null, true);
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000002', true);
select public.save_saas('e8100000-0000-4000-8000-000000000003', 'Revenue Gamma', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false, null, true);

set local role postgres;
select results_eq(
  $$ select saas_id, share_revenue from public.saas_settings
     where saas_id::text like 'e81%' order by saas_id $$,
  $$ values ('e8100000-0000-4000-8000-000000000001'::uuid, false),
    ('e8100000-0000-4000-8000-000000000002'::uuid, true),
    ('e8100000-0000-4000-8000-000000000003'::uuid, true) $$,
  'revenue is private until the founder shares it');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
select public.save_saas('e8100000-0000-4000-8000-000000000002', 'Revenue Beta', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, false,
  false, false);
set local role postgres;
select is((select share_revenue from public.saas_settings
  where saas_id = 'e8100000-0000-4000-8000-000000000002'), true,
  'a save that leaves the choice out keeps it');

-- Connections for all three products.
set local role service_role;
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000001', 'stripe',
  'v1:alpha', 'rk_live_…alph', true, 1000, 1, '{"usd": 1000}', null, '{}', null, null, null);
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000002', 'paddle',
  'v1:beta', 'pdl_live_…beta', true, 500, 1, '{"usd": 500}', null, '{}', null, null, null);
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000003', 'polar',
  'v1:gamma', 'polar_oat_…gamm', true, 0, 0, '{}', null, '{}', null, null, null);

-- The first read: payments of the last six months, not yet back to the first payment.
select is(
  public.record_revenue_payments('e8100000-0000-4000-8000-000000000002', 'paddle',
    jsonb_build_array(jsonb_build_object('from', current_date - 183, 'to', null)),
    array[repeat('a', 64), repeat('b', 64), repeat('c', 64)],
    jsonb_build_array(
      jsonb_build_object('hash', repeat('a', 64), 'day', current_date - 1, 'currency', 'usd',
        'amount', 1000, 'fingerprint', 'a1'),
      jsonb_build_object('hash', repeat('b', 64), 'day', current_date - 40, 'currency', 'eur',
        'amount', 2000, 'fingerprint', 'b1'),
      jsonb_build_object('hash', repeat('c', 64), 'day', current_date - 100, 'currency', 'usd',
        'amount', 3000, 'fingerprint', 'c1')),
    current_date - 183, false, current_date - 29, current_date - 364),
  '{"days30": {"usd": 1000}, "months12": null, "total": null}'::jsonb,
  'the figures cover the windows the stored payments reach');
select is(
  public.revenue_read_state('e8100000-0000-4000-8000-000000000002', current_date - 60),
  jsonb_build_object('provider', 'paddle', 'from', current_date - 183, 'origin', false,
    'read_at', (select revenue_read_at from public.revenue_connections
      where saas_id = 'e8100000-0000-4000-8000-000000000002'),
    'stored', jsonb_build_object(repeat('a', 64), jsonb_build_array('a1', 1000),
      repeat('b', 64), jsonb_build_array('b1', 2000))),
  'the read state gives how far payments reach and the payments from a day on');

-- The next read reaches the first payment. A payment the window no longer lists is gone, and
-- a changed one is replaced.
select is(
  public.record_revenue_payments('e8100000-0000-4000-8000-000000000002', 'paddle',
    jsonb_build_array(jsonb_build_object('from', current_date - 183, 'to', null),
      jsonb_build_object('from', '1970-01-01', 'to', current_date - 183)),
    array[repeat('a', 64), repeat('b', 64), repeat('d', 64)],
    jsonb_build_array(
      jsonb_build_object('hash', repeat('b', 64), 'day', current_date - 40, 'currency', 'eur',
        'amount', 500, 'fingerprint', 'b2'),
      jsonb_build_object('hash', repeat('d', 64), 'day', current_date - 700, 'currency', 'usd',
        'amount', 4000, 'fingerprint', 'd1')),
    '1970-01-01', true, current_date - 29, current_date - 364),
  '{"days30": {"usd": 1000}, "months12": {"eur": 500, "usd": 1000}, "total": {"eur": 500, "usd": 5000}}'::jsonb,
  'a payment left out of a window it was read in is removed, and changed ones replaced');
set local role postgres;
select results_eq(
  $$ select revenue_from, revenue_origin, revenue_read_at is not null, revenue_note
     from public.revenue_connections where saas_id = 'e8100000-0000-4000-8000-000000000002' $$,
  $$ values ('1970-01-01'::date, true, true, null::text) $$,
  'the connection records how far payments reach');

-- One payment verifies one product.
set local role service_role;
select throws_ok(
  $$ select public.record_revenue_payments('e8100000-0000-4000-8000-000000000003', 'polar',
    '[]', array[repeat('a', 64)],
    jsonb_build_array(jsonb_build_object('hash', repeat('a', 64), 'day', current_date,
      'currency', 'usd', 'amount', 1, 'fingerprint', 'x')),
    current_date - 183, false, current_date - 29, current_date - 364) $$,
  '23505', 'These payments already verify another SaaS',
  'a payment that verifies another product is refused');
select throws_ok(
  $$ select public.record_revenue_payments('e8100000-0000-4000-8000-000000000003', 'stripe',
    '[]', '{}', '[]', current_date, false, current_date - 29, current_date - 364) $$,
  'P0002', null, 'payments come from the connected provider only');
select is(
  public.record_revenue_payments('e8100000-0000-4000-8000-000000000003', 'polar',
    jsonb_build_array(jsonb_build_object('from', '1970-01-01', 'to', null)), '{}', '[]',
    '1970-01-01', true, current_date - 29, current_date - 364),
  '{"days30": {}, "months12": {}, "total": {}}'::jsonb,
  'an account without payments earned nothing in every window');

-- The figures are stored with the snapshot and shared as the founder chooses.
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 1000, 1, '{"usd": 1000}', null, '{}', null, null, null, null, 30000, 200000,
  900000, now());
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000002', 'paddle',
  null, null, true, 500, 1, '{"usd": 500}', null, '{}', null, null, null, null, 1000, 1500,
  5500, now());
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000003', 'polar',
  null, null, true, 0, 0, '{}', null, '{}', null, null, null, null, 0, 0, 0, now());
set local role postgres;
select results_eq(
  $$ select revenue_30d_cents, revenue_12m_cents, revenue_total_cents, revenue_at is not null
     from public.revenue_snapshots where saas_id = 'e8100000-0000-4000-8000-000000000001' $$,
  $$ values (30000::bigint, 200000::bigint, 900000::bigint, true) $$,
  'the snapshot holds the revenue figures and when payments were read');
select results_eq(
  $$ select id, revenue_30d_cents, revenue_12m_cents, revenue_total_cents
     from public.public_saas where id::text like 'e81%' order by id $$,
  $$ values ('e8100000-0000-4000-8000-000000000001'::uuid, null::bigint, null::bigint, null::bigint),
    ('e8100000-0000-4000-8000-000000000002'::uuid, 1000, 1500, 5500),
    ('e8100000-0000-4000-8000-000000000003'::uuid, 0, 0, 0) $$,
  'visitors see revenue only where the founder shares it');
select results_eq(
  $$ select id, revenue_status from public.public_saas where id::text like 'e81%' order by id $$,
  $$ values ('e8100000-0000-4000-8000-000000000001'::uuid, 'verified'),
    ('e8100000-0000-4000-8000-000000000002'::uuid, 'private'),
    ('e8100000-0000-4000-8000-000000000003'::uuid, 'verified') $$,
  'sharing revenue does not share MRR');
select results_eq(
  $$ select id, rank_30d, rank_12m, rank_total from public.revenue_leaderboard
     where id::text like 'e81%' order by id $$,
  $$ values ('e8100000-0000-4000-8000-000000000002'::uuid, 1::bigint, 1::bigint, 1::bigint),
    ('e8100000-0000-4000-8000-000000000003'::uuid, 2, 2, 2) $$,
  'the revenue rankings hold products that share revenue, by each window');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_revenue = true
where saas_id = 'e8100000-0000-4000-8000-000000000001';
set local role anon;
select results_eq(
  $$ select id, rank_30d, rank_total from public.revenue_leaderboard
     where id::text like 'e81%' order by rank_30d $$,
  $$ values ('e8100000-0000-4000-8000-000000000001'::uuid, 1::bigint, 1::bigint),
    ('e8100000-0000-4000-8000-000000000002'::uuid, 2, 2),
    ('e8100000-0000-4000-8000-000000000003'::uuid, 3, 3) $$,
  'visitors read the rankings, which follow a founder who shares');

-- A verification older than a week hides the figures like MRR.
set local role postgres;
update public.revenue_snapshots set captured_at = now() - interval '8 days'
where saas_id = 'e8100000-0000-4000-8000-000000000003';
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000003', 'polar',
  null, null, true, 0, 0, '{}', null, '{}', null, null, null, null, 0, 0, 0, now());
update public.revenue_snapshots set captured_at = now() - interval '8 days'
where saas_id = 'e8100000-0000-4000-8000-000000000003';
update public.public_metrics set verified_at = now() - interval '8 days'
where saas_id = 'e8100000-0000-4000-8000-000000000003';
select is_empty(
  $$ select 1 from public.revenue_leaderboard where id = 'e8100000-0000-4000-8000-000000000003' $$,
  'figures from a stale verification leave the rankings');

-- Makers never read payments or run the functions that write them.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
select throws_ok('select count(*) from private.revenue_payments', '42501', null,
  'makers cannot read stored payments');
select throws_ok(
  $$ select public.revenue_read_state('e8100000-0000-4000-8000-000000000002', current_date) $$,
  '42501', null, 'makers cannot read the payment state');
select throws_ok(
  $$ select public.record_revenue_payments('e8100000-0000-4000-8000-000000000002', 'paddle',
    '[]', '{}', '[]', current_date, true, current_date, current_date) $$,
  '42501', null, 'makers cannot record payments');
select results_eq(
  $$ select revenue_origin, revenue_note from public.revenue_connections
     where saas_id = 'e8100000-0000-4000-8000-000000000002' $$,
  $$ values (true, null::text) $$,
  'founders read how far their payments reach');

-- The scheduled run: payments are due when never read, or a day after the last read, or every
-- run's interval while they do not reach the first payment yet.
set local role postgres;
update public.revenue_connections set last_synced_at = now(), last_checked_at = now(),
  revenue_checked_at = now() - interval '2 hours'
where saas_id::text like 'e81%';
update public.revenue_connections set revenue_checked_at = null
where saas_id = 'e8100000-0000-4000-8000-000000000001';
update public.revenue_connections set revenue_from = current_date - 183, revenue_origin = false
where saas_id = 'e8100000-0000-4000-8000-000000000003';
set local role service_role;
select results_eq(
  $$ select saas_id, revenue_due from public.claim_due_verifications(10, interval '55 minutes')
     order by saas_id $$,
  $$ values ('e8100000-0000-4000-8000-000000000001'::uuid, true),
    ('e8100000-0000-4000-8000-000000000003'::uuid, true) $$,
  'payments are due when never read, or while older ones are still to read');
set local role postgres;
select results_eq(
  $$ select saas_id, revenue_checked_at > now() - interval '1 minute', last_checked_at = now()
     from public.revenue_connections where saas_id::text like 'e81%' order by saas_id $$,
  $$ values ('e8100000-0000-4000-8000-000000000001'::uuid, true, true),
    ('e8100000-0000-4000-8000-000000000002'::uuid, false, true),
    ('e8100000-0000-4000-8000-000000000003'::uuid, true, true) $$,
  'claiming marks the payments checked');
update public.revenue_connections set revenue_checked_at = now() - interval '24 hours',
  last_checked_at = now()
where saas_id = 'e8100000-0000-4000-8000-000000000002';
set local role service_role;
select results_eq(
  $$ select saas_id, revenue_due from public.claim_due_verifications(10, interval '55 minutes') $$,
  $$ values ('e8100000-0000-4000-8000-000000000002'::uuid, true) $$,
  'payments that reach the first one are due a day later, even when MRR is not');
set local role postgres;
update public.revenue_connections set revenue_checked_at = now() - interval '2 hours',
  last_checked_at = now() - interval '2 hours', last_synced_at = now() - interval '2 hours'
where saas_id = 'e8100000-0000-4000-8000-000000000002';
set local role service_role;
select results_eq(
  $$ select saas_id, revenue_due from public.claim_due_verifications(10, interval '55 minutes') $$,
  $$ values ('e8100000-0000-4000-8000-000000000002'::uuid, false) $$,
  'MRR alone can be due');

-- A new key may be another account, so the payments start over.
select public.record_revenue_verification('e8100000-0000-4000-8000-000000000002', 'paddle',
  'v1:beta2', 'pdl_live_…bet2', true, 500, 1, '{"usd": 500}', null, '{}', null, null, null);
set local role postgres;
select is((select count(*)::int from private.revenue_payments
  where saas_id = 'e8100000-0000-4000-8000-000000000002'), 0,
  'a new key removes the stored payments');
select results_eq(
  $$ select revenue_from, revenue_origin, revenue_read_at, revenue_checked_at
     from public.revenue_connections where saas_id = 'e8100000-0000-4000-8000-000000000002' $$,
  $$ values (null::date, false, null::timestamptz, null::timestamptz) $$,
  'a new key starts reading payments over');
select is((select revenue_30d_cents from public.public_metrics
  where saas_id = 'e8100000-0000-4000-8000-000000000002'), null::bigint,
  'the new key''s snapshot has no revenue until payments are read');

-- Removing the connection removes its payments and frees them for another product.
set local role service_role;
select public.record_revenue_payments('e8100000-0000-4000-8000-000000000002', 'paddle',
  '[]', array[repeat('e', 64)],
  jsonb_build_array(jsonb_build_object('hash', repeat('e', 64), 'day', current_date,
    'currency', 'usd', 'amount', 100, 'fingerprint', 'e1')),
  current_date - 183, false, current_date - 29, current_date - 364);
set local role postgres;
delete from public.revenue_connections where saas_id = 'e8100000-0000-4000-8000-000000000002';
select is((select count(*)::int from private.revenue_payments
  where payment_hash = repeat('e', 64)), 0,
  'disconnecting removes the stored payments');
select is((select revenue_total_cents from public.public_metrics
  where saas_id = 'e8100000-0000-4000-8000-000000000002'), null::bigint,
  'a disconnected product shows no revenue');
set local role service_role;
select lives_ok(
  $$ select public.record_revenue_payments('e8100000-0000-4000-8000-000000000003', 'polar',
    '[]', array[repeat('e', 64)],
    jsonb_build_array(jsonb_build_object('hash', repeat('e', 64), 'day', current_date,
      'currency', 'usd', 'amount', 100, 'fingerprint', 'e1')),
    current_date - 183, false, current_date - 29, current_date - 364) $$,
  'a freed payment can verify another product');
set local role postgres;
select throws_ok(
  $$ insert into private.revenue_payments(payment_hash, saas_id, day, currency, amount, fingerprint)
     values (repeat('f', 64), 'e8100000-0000-4000-8000-000000000003', current_date, 'USD', 1, 'f') $$,
  '23514', null, 'currencies are stored as lowercase codes');

select * from finish();
rollback;

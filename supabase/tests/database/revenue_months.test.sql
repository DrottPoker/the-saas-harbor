-- Revenue by month: each stored payment has a kind, a read of payments returns each month's
-- totals per kind from the first month the payments cover, payments stored before kinds were read
-- are found and sorted, and the months follow the founder's sharing choices, the split only with
-- MRR shared. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id) values ('e9000000-0000-4000-8000-000000000001');
insert into public.profiles(id, name) values ('e9000000-0000-4000-8000-000000000001', 'Months One');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
-- Alpha shares MRR and revenue, Beta revenue only.
select public.save_saas('e9100000-0000-4000-8000-000000000001', 'Months Alpha', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false, null, true);
select public.save_saas('e9100000-0000-4000-8000-000000000002', 'Months Beta', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, false,
  false, false, null, true);

set local role service_role;
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000001', 'stripe',
  'v1:alpha', 'rk_live_…alph', true, 1000, 1, '{"usd": 1000}', null, '{}', null, null, null);
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000002', 'paddle',
  'v1:beta', 'pdl_live_…beta', true, 500, 1, '{"usd": 500}', null, '{}', null, null, null);

-- The months run from twelve months back to the start of the current one, which they leave out.
select is(
  public.record_revenue_payments('e9100000-0000-4000-8000-000000000001', 'stripe',
    jsonb_build_array(jsonb_build_object('from', '1970-01-01', 'to', null)),
    array[repeat('1', 64), repeat('2', 64), repeat('3', 64), repeat('4', 64)],
    jsonb_build_array(
      jsonb_build_object('hash', repeat('1', 64),
        'day', (date_trunc('month', current_date) - interval '12 months')::date + 4,
        'currency', 'usd', 'amount', 1000, 'fingerprint', 'a', 'kind', 'subscription'),
      jsonb_build_object('hash', repeat('2', 64),
        'day', (date_trunc('month', current_date) - interval '12 months')::date + 5,
        'currency', 'eur', 'amount', 800, 'fingerprint', 'b', 'kind', 'subscription'),
      jsonb_build_object('hash', repeat('3', 64),
        'day', (date_trunc('month', current_date) - interval '12 months')::date + 6,
        'currency', 'usd', 'amount', 500, 'fingerprint', 'c', 'kind', 'one_time'),
      jsonb_build_object('hash', repeat('4', 64), 'day', date_trunc('month', current_date)::date,
        'currency', 'usd', 'amount', 700, 'fingerprint', 'd', 'kind', 'one_time')),
    '1970-01-01', true, current_date - 29, current_date - 364, null, null,
    (date_trunc('month', current_date) - interval '12 months')::date,
    date_trunc('month', current_date)::date) -> 'months',
  jsonb_build_object('from', (date_trunc('month', current_date) - interval '12 months')::date,
    'totals', jsonb_build_object(
      to_char(date_trunc('month', current_date) - interval '12 months', 'YYYY-MM'),
      '{"subscription": {"usd": 1000, "eur": 800}, "one_time": {"usd": 500}}'::jsonb)),
  'the months give each month''s totals per kind and currency');
set local role postgres;
select results_eq(
  $$ select payment_hash, kind from private.revenue_payments
     where saas_id = 'e9100000-0000-4000-8000-000000000001' order by payment_hash $$,
  $$ values (repeat('1', 64), 'subscription'), (repeat('2', 64), 'subscription'),
    (repeat('3', 64), 'one_time'), (repeat('4', 64), 'one_time') $$,
  'each payment is stored with its kind');
select throws_ok(
  $$ update private.revenue_payments set kind = 'refund' where payment_hash = repeat('1', 64) $$,
  '23514', null, 'a kind is a subscription, a one-time purchase or unknown');

-- A payment stored by code that reads no kinds has none, and counts as unknown.
set local role service_role;
select public.record_revenue_payments('e9100000-0000-4000-8000-000000000001', 'stripe',
  '[]', array[repeat('5', 64)],
  jsonb_build_array(jsonb_build_object('hash', repeat('5', 64),
    'day', (date_trunc('month', current_date) - interval '11 months')::date + 2,
    'currency', 'usd', 'amount', 300, 'fingerprint', 'e')),
  '1970-01-01', true, current_date - 29, current_date - 364);
select is(
  public.record_revenue_payments('e9100000-0000-4000-8000-000000000001', 'stripe', '[]', '{}',
    '[]', '1970-01-01', true, current_date - 29, current_date - 364, null, null,
    (date_trunc('month', current_date) - interval '12 months')::date,
    date_trunc('month', current_date)::date)
    -> 'months' -> 'totals'
    -> to_char(date_trunc('month', current_date) - interval '11 months', 'YYYY-MM'),
  '{"unknown": {"usd": 300}}'::jsonb,
  'a payment without a kind counts as unknown');
select is(
  public.revenue_read_state('e9100000-0000-4000-8000-000000000001', current_date - 183,
    (date_trunc('month', current_date) - interval '12 months')::date) -> 'unsorted',
  jsonb_build_object(
    'from', (date_trunc('month', current_date) - interval '11 months')::date + 2,
    'to', (date_trunc('month', current_date) - interval '11 months')::date + 3),
  'the read state names the days of the charted payments without a kind');
select ok(
  (public.revenue_read_state('e9100000-0000-4000-8000-000000000001', current_date - 183,
    (date_trunc('month', current_date) - interval '12 months')::date) -> 'stored')
    ? repeat('5', 64)
  and not (public.revenue_read_state('e9100000-0000-4000-8000-000000000001', current_date - 183,
    (date_trunc('month', current_date) - interval '12 months')::date) -> 'stored')
    ? repeat('1', 64),
  'and gives the stored payments from the first of those days on');
select is(
  public.revenue_read_state('e9100000-0000-4000-8000-000000000001', current_date - 183)
    -> 'unsorted',
  'null'::jsonb, 'without the months, nothing is unsorted');

-- A read that finds the kind of an unchanged payment stores it.
select is(
  public.record_revenue_payments('e9100000-0000-4000-8000-000000000001', 'stripe', '[]', '{}',
    '[]', '1970-01-01', true, current_date - 29, current_date - 364, null,
    jsonb_build_array(jsonb_build_object('hash', repeat('5', 64), 'kind', 'one_time')),
    (date_trunc('month', current_date) - interval '12 months')::date,
    date_trunc('month', current_date)::date)
    -> 'months' -> 'totals'
    -> to_char(date_trunc('month', current_date) - interval '11 months', 'YYYY-MM'),
  '{"one_time": {"usd": 300}}'::jsonb,
  'the kinds of unchanged payments are stored');
select is(
  public.revenue_read_state('e9100000-0000-4000-8000-000000000001', current_date - 183,
    (date_trunc('month', current_date) - interval '12 months')::date) -> 'unsorted',
  'null'::jsonb, 'then no charted payment is without a kind');

-- A changed payment from code that reads no kinds keeps its kind.
select public.record_revenue_payments('e9100000-0000-4000-8000-000000000001', 'stripe',
  '[]', array[repeat('3', 64)],
  jsonb_build_array(jsonb_build_object('hash', repeat('3', 64),
    'day', (date_trunc('month', current_date) - interval '12 months')::date + 6,
    'currency', 'usd', 'amount', 200, 'fingerprint', 'c2')),
  '1970-01-01', true, current_date - 29, current_date - 364);
set local role postgres;
select is((select kind from private.revenue_payments where payment_hash = repeat('3', 64)),
  'one_time', 'a payment changed without a kind keeps the one stored');

-- Months count from the first one the stored payments cover in full, and not at all before.
set local role service_role;
select is(
  public.record_revenue_payments('e9100000-0000-4000-8000-000000000002', 'paddle',
    jsonb_build_array(jsonb_build_object('from',
      (date_trunc('month', current_date) - interval '11 months')::date + 9, 'to', null)),
    '{}', '[]', (date_trunc('month', current_date) - interval '11 months')::date + 9, false,
    current_date - 29, current_date - 364, null, null,
    (date_trunc('month', current_date) - interval '12 months')::date,
    date_trunc('month', current_date)::date) -> 'months',
  jsonb_build_object('from', (date_trunc('month', current_date) - interval '10 months')::date,
    'totals', '{}'::jsonb),
  'the months start with the first one covered in full');
select is(
  public.record_revenue_payments('e9100000-0000-4000-8000-000000000002', 'paddle', '[]', '{}',
    '[]', date_trunc('month', current_date)::date, false, current_date - 29, current_date - 364,
    null, null, (date_trunc('month', current_date) - interval '12 months')::date,
    date_trunc('month', current_date)::date) -> 'months',
  'null'::jsonb, 'payments that cover no month give none');

-- The months are stored with the snapshot and shared as the founder chooses.
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 1000, 1, '{"usd": 1000}', null, '{}', null, null, null, null, 900, 900, 900,
  now(), p_revenue_history =>
    '[{"month": "2026-08", "cents": 900, "subscription_cents": 800, "one_time_cents": 100}]');
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000002', 'paddle',
  null, null, true, 500, 1, '{"usd": 500}', null, '{}', null, null, null, null, 900, 900, 900,
  now(), p_revenue_history =>
    '[{"month": "2026-08", "cents": 900, "subscription_cents": 800, "one_time_cents": 100}]');
set local role anon;
select results_eq(
  $$ select id, revenue_history from public.public_saas where id::text like 'e91%' order by id $$,
  $$ values ('e9100000-0000-4000-8000-000000000001'::uuid,
      '[{"month": "2026-08", "cents": 900, "subscription_cents": 800, "one_time_cents": 100}]'::jsonb),
    ('e9100000-0000-4000-8000-000000000002'::uuid,
      '[{"month": "2026-08", "cents": 900}]'::jsonb) $$,
  'visitors see the months where revenue is shared, split only where MRR is shared too');
select is(
  (select revenue_history from public.revenue_leaderboard
   where id = 'e9100000-0000-4000-8000-000000000002'),
  '[{"month": "2026-08", "cents": 900}]'::jsonb, 'the revenue rankings carry the months');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_revenue = false
where saas_id = 'e9100000-0000-4000-8000-000000000001';
set local role postgres;
select is((select revenue_history from public.public_metrics
  where saas_id = 'e9100000-0000-4000-8000-000000000001'), null::jsonb,
  'months the founder keeps private are not projected');

-- A verification older than a week hides the months like the other figures.
update public.public_metrics set verified_at = now() - interval '8 days'
where saas_id = 'e9100000-0000-4000-8000-000000000002';
set local role anon;
select is((select revenue_history from public.public_saas
  where id = 'e9100000-0000-4000-8000-000000000002'), null::jsonb,
  'months from a stale verification are hidden');

select * from finish();
rollback;

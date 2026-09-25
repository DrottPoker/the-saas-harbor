-- The statistics page's figures: computed from shared, fresh, verified MRR only. Runs in a
-- rolled-back transaction that first unranks every existing product, so local data does not
-- matter.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from public.public_metrics;

insert into auth.users(id) values
  ('b7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-000000000001', true);
select public.save_saas('b7100000-0000-4000-8000-000000000001', 'Stats Zero', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, true, false);
select public.save_saas('b7100000-0000-4000-8000-000000000002', 'Stats Small', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null,
  current_date - 200, true, true, true);
select public.save_saas('b7100000-0000-4000-8000-000000000003', 'Stats Mid', 'Fixture',
  'A temporary fixture that is rolled back.', 'Finance', 'https://example.com', null,
  (current_date - interval '3 years')::date, true, false, true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-000000000002', true);
select public.save_saas('b7100000-0000-4000-8000-000000000004', 'Stats Large', 'Fixture',
  'A temporary fixture that is rolled back.', 'Finance', 'https://example.com', null, null,
  true, true, false);
select public.save_saas('b7100000-0000-4000-8000-000000000005', 'Stats Private', 'Fixture',
  'A temporary fixture that is rolled back.', 'Finance', 'https://example.com', null, null,
  false, true, false);

set local role service_role;
select public.record_stripe_verification(v.id, 'v1:stats', 'rk_live_…sta', true, v.mrr,
  v.customers, '{}', null, array[md5(v.id::text) || md5(v.id::text)], v.history, v.now,
  v.before)
from (values
  ('b7100000-0000-4000-8000-000000000001'::uuid, 0::bigint, 0,
    '[{"month":"2026-07","mrr_cents":0},{"month":"2026-08","mrr_cents":0}]'::jsonb, 0::bigint,
    0::bigint),
  ('b7100000-0000-4000-8000-000000000002', 5000, 2,
    '[{"month":"2026-07","mrr_cents":4000},{"month":"2026-08","mrr_cents":5000}]', 4500, 5000),
  ('b7100000-0000-4000-8000-000000000003', 150000, 10,
    '[{"month":"2026-07","mrr_cents":140000},{"month":"2026-08","mrr_cents":150000}]', 110, 100),
  ('b7100000-0000-4000-8000-000000000004', 2000000, 50,
    '[{"month":"2026-06","mrr_cents":1},{"month":"2026-07","mrr_cents":1900000}]', 100, 100),
  ('b7100000-0000-4000-8000-000000000005', 99900000, 999, null, null, null)
) as v(id, mrr, customers, history, now, before);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
create temp table stats on commit drop as select public.directory_stats() as s;

select is((select (s->>'ranked')::int from stats), 4, 'private products are not counted');
select is((select (s->>'mrr_cents')::bigint from stats), 2155000::bigint, 'MRR is summed');
select is((select (s->>'median_mrr_cents')::bigint from stats), 77500::bigint,
  'the median of an even count is the mean of the middle two');
select is((select s->'customers' from stats), '52'::jsonb,
  'paying customers are summed over the products that share them');
select is((select (s->>'customer_products')::int from stats), 3,
  'products without shared customers are left out of that sum');
select is((select s->'buckets' from stats), '[
  {"min_cents": 0, "max_cents": 0, "products": 1},
  {"min_cents": 1, "max_cents": 99999, "products": 1},
  {"min_cents": 100000, "max_cents": 999999, "products": 1},
  {"min_cents": 1000000, "max_cents": 9999999, "products": 1},
  {"min_cents": 10000000, "max_cents": null, "products": 0}]'::jsonb,
  'every MRR bucket is listed, empty ones too');
select is((select s->'categories' from stats), '[
  {"category": "Finance", "products": 2, "mrr_cents": 2150000, "median_mrr_cents": 1075000},
  {"category": "Analytics", "products": 2, "mrr_cents": 5000, "median_mrr_cents": 2500}]'::jsonb,
  'categories are ordered by their MRR');
select is((select s->'growth' from stats),
  '{"products": 3, "median_pct": 0, "growing": 1, "shrinking": 1, "flat": 1}'::jsonb,
  'growth counts only products with a basis 30 days ago');
select is((select s->'ages' from stats), '[
  {"min_years": 0, "max_years": 1, "products": 1, "median_mrr_cents": 5000},
  {"min_years": 1, "max_years": 2, "products": 0, "median_mrr_cents": null},
  {"min_years": 2, "max_years": 5, "products": 1, "median_mrr_cents": 150000},
  {"min_years": 5, "max_years": null, "products": 0, "median_mrr_cents": null}]'::jsonb,
  'product age uses shared launch dates only');
select is((select s->'history' from stats),
  '[{"month": "2026-07", "mrr_cents": 2044000}]'::jsonb,
  'the combined history keeps only months every product covers');
select is((select s->'fastest' from stats),
  '[{"slug": "stats-mid", "name": "Stats Mid", "mrr_cents": 150000, "mrr_growth_pct": 10.0}]'::jsonb,
  'the fastest growing need at least $1,000 MRR');

-- A stale verification leaves the statistics like it leaves the leaderboard.
set local role postgres;
update public.public_metrics set verified_at = now() - interval '8 days'
where saas_id = 'b7100000-0000-4000-8000-000000000004';
set local role anon;
select is((public.directory_stats()->>'ranked')::int, 3, 'stale figures are not counted');
select is(public.directory_stats()->'history',
  '[{"month": "2026-07", "mrr_cents": 144000}, {"month": "2026-08", "mrr_cents": 155000}]'::jsonb,
  'the history follows the products that are counted');

set local role postgres;
select ok(
  (select prosecdef = false and proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.directory_stats()'::regprocedure),
  'the statistics run with the caller''s rights and an empty search path');

select * from finish();
rollback;

-- Statistics for the public statistics page, computed from the leaderboard with the caller's
-- rights: only shared, fresh, verified figures of listed products count, the same figures the
-- leaderboard already shows one by one.
create function public.directory_stats() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ranked as (
    select slug, name, category, mrr_cents, customers, mrr_growth_pct, launched_on, mrr_history
    from public.leaderboard
  ),
  -- Month-end MRR summed over the ranked products, for the months every product with a history
  -- covers, so a month is never summed over some of them only.
  history as (
    select point->>'month' as month, sum((point->>'mrr_cents')::bigint) as mrr_cents,
      count(*) as products
    from ranked, jsonb_array_elements(ranked.mrr_history) as point
    where jsonb_typeof(ranked.mrr_history) = 'array'
    group by 1
  ),
  buckets(min_cents, max_cents) as (
    values (0::bigint, 0::bigint), (1, 99999), (100000, 999999), (1000000, 9999999),
      (10000000, null)
  ),
  ages(min_years, max_years) as (values (0, 1), (1, 2), (2, 5), (5, null))
  select jsonb_build_object(
    'ranked', (select count(*) from ranked),
    'mrr_cents', (select coalesce(sum(mrr_cents), 0) from ranked),
    'median_mrr_cents',
      (select round(percentile_cont(0.5) within group (order by mrr_cents)) from ranked),
    'customers', (select sum(customers) from ranked),
    'customer_products', (select count(customers) from ranked),
    'buckets', (
      select jsonb_agg(jsonb_build_object('min_cents', b.min_cents, 'max_cents', b.max_cents,
        'products', (select count(*) from ranked r
          where r.mrr_cents >= b.min_cents and (b.max_cents is null or r.mrr_cents <= b.max_cents)))
        order by b.min_cents)
      from buckets b),
    'categories', (
      select coalesce(jsonb_agg(c order by c.mrr_cents desc, c.category), '[]'::jsonb)
      from (
        select category, count(*) as products, sum(mrr_cents) as mrr_cents,
          round(percentile_cont(0.5) within group (order by mrr_cents)) as median_mrr_cents
        from ranked group by category
      ) c),
    'growth', (
      select jsonb_build_object('products', count(mrr_growth_pct),
        'median_pct', round((percentile_cont(0.5) within group (order by mrr_growth_pct))::numeric, 1),
        'growing', count(*) filter (where mrr_growth_pct > 0),
        'shrinking', count(*) filter (where mrr_growth_pct < 0),
        'flat', count(*) filter (where mrr_growth_pct = 0))
      from ranked),
    'ages', (
      select jsonb_agg(jsonb_build_object('min_years', a.min_years, 'max_years', a.max_years,
        'products', s.products, 'median_mrr_cents', s.median_mrr_cents) order by a.min_years)
      from ages a
      cross join lateral (
        select count(*) as products,
          round(percentile_cont(0.5) within group (order by r.mrr_cents)) as median_mrr_cents
        from ranked r
        where r.launched_on is not null
          and extract(year from age(current_date, r.launched_on)) >= a.min_years
          and (a.max_years is null
            or extract(year from age(current_date, r.launched_on)) < a.max_years)
      ) s),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('month', h.month, 'mrr_cents', h.mrr_cents)
        order by h.month), '[]'::jsonb)
      from history h
      where h.products = (select count(*) from ranked where jsonb_typeof(mrr_history) = 'array')),
    'fastest', (
      select coalesce(jsonb_agg(f), '[]'::jsonb)
      from (
        select slug, name, mrr_cents, mrr_growth_pct from ranked
        where mrr_growth_pct > 0 and mrr_cents >= 100000
        order by mrr_growth_pct desc, mrr_cents desc, slug
        limit 5
      ) f)
  );
$$;

revoke execute on function public.directory_stats() from public;
grant execute on function public.directory_stats() to anon, authenticated;

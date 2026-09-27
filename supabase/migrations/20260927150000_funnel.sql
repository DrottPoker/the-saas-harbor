-- The admin panel's funnel: how far the accounts created in a period have come since, from
-- signing up to a place on the leaderboard, next to the visitors of the same period.

-- 1. The products on the leaderboard, as visitors see it. Reports run as their owner, which RLS
-- does not limit, so reading public.leaderboard there would count hidden products and suspended
-- founders too.
create function private.ranked_saas() returns table (saas_id uuid, owner_id uuid, mrr_cents bigint)
language sql stable set search_path = '' as $$
  select s.id, s.owner_id, m.mrr_cents
  from public.saas s
  join public.profiles p on p.id = s.owner_id
  join public.public_metrics m on m.saas_id = s.id
  where s.hidden_at is null and p.suspended_at is null
    and m.mrr_cents is not null and m.verified_at > now() - interval '7 days'
$$;
revoke execute on function private.ranked_saas() from public, anon, authenticated;

-- 2. The steps, for the accounts created in [p_from, p_to). Each step counts the accounts that
-- also took every step before it, with the median time from sign-up. Revenue counts as verified
-- from the account's first snapshot; a product's snapshots go with the product.
create function private.funnel_steps(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  with ranked as (
    select distinct k.owner_id from private.ranked_saas() k
  ),
  cohort as (
    select u.created_at,
      u.email_confirmed_at as confirmed_at,
      (select min(s.created_at) from public.saas s where s.owner_id = u.id) as product_at,
      (select min(r.captured_at) from public.revenue_snapshots r where r.owner_id = u.id)
        as verified_at,
      u.id in (select owner_id from ranked) as ranked
    from auth.users u
    where u.created_at >= p_from and u.created_at < p_to
  ),
  reached as (
    select c.created_at,
      c.confirmed_at,
      case when c.confirmed_at is not null then c.product_at end as product_at,
      case when c.confirmed_at is not null and c.product_at is not null then c.verified_at end
        as verified_at,
      c.confirmed_at is not null and c.product_at is not null and c.verified_at is not null
        and c.ranked as ranked
    from cohort c
  )
  select jsonb_build_array(
    jsonb_build_object('key', 'signed_up', 'accounts', count(*), 'median_seconds', null),
    jsonb_build_object('key', 'confirmed', 'accounts', count(r.confirmed_at),
      'median_seconds', round(percentile_cont(0.5) within group (
        order by extract(epoch from r.confirmed_at - r.created_at)))),
    jsonb_build_object('key', 'product', 'accounts', count(r.product_at),
      'median_seconds', round(percentile_cont(0.5) within group (
        order by extract(epoch from r.product_at - r.created_at)))),
    jsonb_build_object('key', 'verified', 'accounts', count(r.verified_at),
      'median_seconds', round(percentile_cont(0.5) within group (
        order by extract(epoch from r.verified_at - r.created_at)))),
    jsonb_build_object('key', 'ranked', 'accounts', count(*) filter (where r.ranked),
      'median_seconds', null))
  from reached r
$$;
revoke execute on function private.funnel_steps(timestamptz, timestamptz)
  from public, anon, authenticated;

create function private.funnel_period(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'visitors', (select count(distinct v.visitor) from private.page_views v
      where v.created_at >= p_from and v.created_at < p_to),
    'steps', private.funnel_steps(p_from, p_to))
$$;
revoke execute on function private.funnel_period(timestamptz, timestamptz)
  from public, anon, authenticated;

create function public.admin_analytics_funnel(p_range text, p_tz text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  select * into p from private.analytics_period(p_range, p_tz,
    (select min(u.created_at) from auth.users u));
  return jsonb_build_object(
    'range', p_range,
    'from', to_char(p.period_from at time zone p_tz, 'YYYY-MM-DD"T"HH24:MI'),
    'current', private.funnel_period(p.period_from, p.period_to),
    'previous', case when p.previous_from is not null
      then private.funnel_period(p.previous_from, p.previous_to) end);
end;
$$;
revoke execute on function public.admin_analytics_funnel(text, text) from public, anon;
grant execute on function public.admin_analytics_funnel(text, text) to authenticated;

-- 3. The platform report's ranked products and their MRR, as on the leaderboard.
create or replace function public.admin_analytics_platform(p_range text, p_tz text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  select * into p from private.analytics_period(p_range, p_tz,
    (select min(u.created_at) from auth.users u));
  return jsonb_build_object(
    'range', p_range,
    'bucket', p.bucket,
    'from', to_char(p.period_from at time zone p_tz, 'YYYY-MM-DD"T"HH24:MI'),
    'now', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'products', (select count(*) from public.saas s where s.hidden_at is null),
      'ranked', (select count(*) from private.ranked_saas()),
      'mrr_cents', (select coalesce(sum(k.mrr_cents), 0) from private.ranked_saas() k),
      'connections', (select count(*) from public.revenue_connections)),
    'totals', private.platform_totals(p.period_from, p.period_to),
    'previous', case when p.previous_from is not null
      then private.platform_totals(p.previous_from, p.previous_to) end,
    'series', private.platform_series(p.period_from, p.period_to, p_tz, p.bucket),
    'previous_series', case when p.previous_from is not null
      then private.platform_series(p.previous_from, p.previous_to, p_tz, p.bucket) end);
end;
$$;

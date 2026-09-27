-- Where new accounts come from, and who stopped where. When an account is created, the site
-- statistics' visit that led to it gives the account its source: the linking site, the campaign
-- tags and the first page. The funnel can then say which sources bring accounts that go on, and
-- list the accounts that stopped at each step.

-- 1. The source of each account, kept with the account. Only what the visit's first page view
-- recorded; the visitor hash stays in the statistics.
create table private.account_sources (
  user_id uuid primary key references auth.users(id) on delete cascade,
  visit_started_at timestamptz not null,
  entry_path text not null,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  recorded_at timestamptz not null default now()
);
alter table private.account_sources enable row level security;
revoke all on private.account_sources from public, anon, authenticated;

-- Records a new account's source from the visitor's visits today, which only the same address and
-- browser can match: the latest visit that came from somewhere, else the latest visit. A visit from
-- an earlier UTC day cannot be matched, as its visitor hash is gone. Returns whether a source was
-- recorded; an account is given one once, within an hour of its creation.
create function public.record_account_source(p_user uuid, p_ip text, p_user_agent text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_visitor bytea;
  v_entry private.page_views%rowtype;
begin
  if exists (select 1 from private.account_sources a where a.user_id = p_user)
    or not exists (select 1 from auth.users u
      where u.id = p_user and u.created_at > now() - interval '1 hour') then
    return false;
  end if;
  v_visitor := private.analytics_visitor(p_ip, p_user_agent);
  select e.* into v_entry
  from private.page_views e
  where e.id in (
    select v.visit from private.page_views v
    where v.visitor = v_visitor and v.created_at > now() - interval '1 day')
  order by (e.referrer is not null or e.utm_source is not null) desc, e.created_at desc, e.id desc
  limit 1;
  if v_entry.id is null then return false; end if;
  insert into private.account_sources(user_id, visit_started_at, entry_path, referrer, utm_source,
    utm_medium, utm_campaign, utm_term, utm_content)
  values (p_user, v_entry.created_at, v_entry.path, v_entry.referrer, v_entry.utm_source,
    v_entry.utm_medium, v_entry.utm_campaign, v_entry.utm_term, v_entry.utm_content)
  on conflict (user_id) do nothing;
  return found;
end;
$$;
revoke execute on function public.record_account_source(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_account_source(uuid, text, text) to service_role;

-- 2. The funnel's accounts, one row each, with the steps they took and their last one. Each step
-- counts only when every step before it was taken, as in migration 20260927150000.
create function private.funnel_cohort(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, created_at timestamptz, confirmed_at timestamptz,
  product_at timestamptz, verified_at timestamptz, ranked boolean, last_step text)
language sql stable set search_path = '' as $$
  with ranked as (
    select distinct k.owner_id from private.ranked_saas() k
  ),
  cohort as (
    select u.id, u.created_at,
      u.email_confirmed_at as confirmed_at,
      (select min(s.created_at) from public.saas s where s.owner_id = u.id) as product_at,
      (select min(r.captured_at) from public.revenue_snapshots r where r.owner_id = u.id)
        as verified_at,
      u.id in (select owner_id from ranked) as ranked
    from auth.users u
    where u.created_at >= p_from and u.created_at < p_to
  ),
  reached as (
    select c.id, c.created_at,
      c.confirmed_at,
      case when c.confirmed_at is not null then c.product_at end as product_at,
      case when c.confirmed_at is not null and c.product_at is not null then c.verified_at end
        as verified_at,
      c.confirmed_at is not null and c.product_at is not null and c.verified_at is not null
        and c.ranked as ranked
    from cohort c
  )
  select r.id, r.created_at, r.confirmed_at, r.product_at, r.verified_at, r.ranked,
    case
      when r.ranked then 'ranked'
      when r.verified_at is not null then 'verified'
      when r.product_at is not null then 'product'
      when r.confirmed_at is not null then 'confirmed'
      else 'signed_up'
    end
  from reached r
$$;
revoke execute on function private.funnel_cohort(timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function private.funnel_steps(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('key', 'signed_up', 'accounts', count(*), 'median_seconds', null),
    jsonb_build_object('key', 'confirmed', 'accounts', count(c.confirmed_at),
      'median_seconds', round(percentile_cont(0.5) within group (
        order by extract(epoch from c.confirmed_at - c.created_at)))),
    jsonb_build_object('key', 'product', 'accounts', count(c.product_at),
      'median_seconds', round(percentile_cont(0.5) within group (
        order by extract(epoch from c.product_at - c.created_at)))),
    jsonb_build_object('key', 'verified', 'accounts', count(c.verified_at),
      'median_seconds', round(percentile_cont(0.5) within group (
        order by extract(epoch from c.verified_at - c.created_at)))),
    jsonb_build_object('key', 'ranked', 'accounts', count(*) filter (where c.ranked),
      'median_seconds', null))
  from private.funnel_cohort(p_from, p_to) c
$$;

-- 3. The accounts of a funnel period whose last step is p_step, newest first, in the same shape
-- as admin_accounts, so the Accounts page lists them the same way.
create function public.admin_funnel_accounts(p_range text, p_tz text, p_step text)
returns table (id uuid, email text, name text, headline text, avatar_path text,
  created_at timestamptz, last_sign_in_at timestamptz, suspended_at timestamptz,
  is_admin boolean, products integer, open_reports integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  if p_step not in ('signed_up', 'confirmed', 'product', 'verified', 'ranked') then
    raise exception 'Choose a step of the funnel';
  end if;
  select * into p from private.analytics_period(p_range, p_tz,
    (select min(u.created_at) from auth.users u));
  return query
  select u.id, u.email::text, pr.name, pr.headline, pr.avatar_path, u.created_at,
    u.last_sign_in_at, pr.suspended_at,
    exists (select 1 from private.admins a where a.user_id = u.id),
    (select count(*)::integer from public.saas s where s.owner_id = u.id),
    (select count(*)::integer from public.reports r where r.subject_id = u.id and r.status = 'open')
  from private.funnel_cohort(p.period_from, p.period_to) c
  join auth.users u on u.id = c.user_id
  left join public.profiles pr on pr.id = u.id
  where c.last_step = p_step
  order by u.created_at desc, u.id;
end;
$$;
revoke execute on function public.admin_funnel_accounts(text, text, text) from public, anon;
grant execute on function public.admin_funnel_accounts(text, text, text) to authenticated;

-- 4. The funnel by source: for each channel, source, campaign or first page, the accounts created
-- in the period and how many took each step. Accounts without a recorded source are one row.
create function private.funnel_sources(p_from timestamptz, p_to timestamptz, p_dimension text)
returns jsonb language sql stable set search_path = '' as $$
  with grouped as (
    select a.user_id is not null as known,
      case when a.user_id is not null then
        case p_dimension
          when 'channel' then private.analytics_channel(a.referrer, a.utm_source, a.utm_medium)
          when 'source' then private.analytics_source(a.referrer, a.utm_source)
          when 'campaign' then a.utm_campaign
          when 'entry_page' then a.entry_path
        end
      end as value,
      count(*) as accounts,
      count(c.confirmed_at) as confirmed,
      count(c.product_at) as product,
      count(c.verified_at) as verified,
      count(*) filter (where c.ranked) as ranked
    from private.funnel_cohort(p_from, p_to) c
    left join private.account_sources a on a.user_id = c.user_id
    group by 1, 2
  )
  select jsonb_build_object(
    'accounts', coalesce(sum(g.accounts), 0),
    'known', coalesce(sum(g.accounts) filter (where g.known), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object('known', g.known, 'value', g.value,
      'accounts', g.accounts, 'confirmed', g.confirmed, 'product', g.product,
      'verified', g.verified, 'ranked', g.ranked)
      order by g.known desc, g.accounts desc, g.ranked desc, g.value), '[]'::jsonb))
  from grouped g
$$;
revoke execute on function private.funnel_sources(timestamptz, timestamptz, text)
  from public, anon, authenticated;

create function public.admin_analytics_sources(p_range text, p_tz text, p_dimension text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  if p_dimension not in ('channel', 'source', 'campaign', 'entry_page') then
    raise exception 'Choose channel, source, campaign or entry_page';
  end if;
  select * into p from private.analytics_period(p_range, p_tz,
    (select min(u.created_at) from auth.users u));
  return jsonb_build_object('range', p_range, 'dimension', p_dimension)
    || private.funnel_sources(p.period_from, p.period_to, p_dimension);
end;
$$;
revoke execute on function public.admin_analytics_sources(text, text, text) from public, anon;
grant execute on function public.admin_analytics_sources(text, text, text) to authenticated;

-- 5. An account's page shows its source.
drop function public.admin_account(uuid);
create function public.admin_account(p_id uuid)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, is_admin boolean, country text, country_at timestamptz,
  source_channel text, source_name text, source_campaign text, source_entry_path text,
  source_visit_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    exists (select 1 from private.admins a where a.user_id = u.id), c.country, c.signed_in_at,
    case when s.user_id is not null
      then private.analytics_channel(s.referrer, s.utm_source, s.utm_medium) end,
    private.analytics_source(s.referrer, s.utm_source), s.utm_campaign, s.entry_path,
    s.visit_started_at
  from auth.users u
  left join private.sign_in_countries c on c.user_id = u.id
  left join private.account_sources s on s.user_id = u.id
  where u.id = p_id;
end;
$$;
revoke execute on function public.admin_account(uuid) from public, anon, service_role;
grant execute on function public.admin_account(uuid) to authenticated;

-- Site statistics of our own. The browser reports each page it shows to /api/analytics, the server
-- writes it through record_page_view() (service_role only), and admins read only totals through
-- admin_analytics(). No cookies, account ids or IP addresses are stored: a visitor is a hash of
-- the IP address and user agent with a random salt that changes every UTC day and is deleted
-- after it, so a hash cannot be traced back to a person or followed from one day to the next.
create extension if not exists pgcrypto with schema extensions;

create table private.analytics_salts (
  day date primary key,
  salt bytea not null check (octet_length(salt) = 32)
);
alter table private.analytics_salts enable row level security;
revoke all on private.analytics_salts from public, anon, authenticated;

create table private.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor bytea not null check (octet_length(visitor) = 16),
  -- A path on this site without its query, with ids in private addresses replaced by [id].
  path text not null check (char_length(path) between 1 and 300 and path ~ '^/'),
  -- The first page of a visit: nothing from the same visitor in the 30 minutes before. Only
  -- entries keep where the visit came from.
  entry boolean not null,
  referrer text check (referrer is null or (entry and char_length(referrer) between 1 and 253)),
  utm_source text check (utm_source is null or (entry and char_length(utm_source) between 1 and 100)),
  utm_medium text check (utm_medium is null or (entry and char_length(utm_medium) between 1 and 100)),
  utm_campaign text check (utm_campaign is null or (entry and char_length(utm_campaign) between 1 and 100)),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  device text not null check (device in ('desktop', 'mobile', 'tablet', 'other')),
  browser text not null check (char_length(browser) between 1 and 40),
  os text not null check (char_length(os) between 1 and 40)
);
create index page_views_created_idx on private.page_views(created_at);
create index page_views_visitor_idx on private.page_views(visitor, created_at);
alter table private.page_views enable row level security;
revoke all on private.page_views from public, anon, authenticated;

-- Records one page view from the analytics route, which has already left out bots and admins and
-- cleaned the values. Returns false when the visitor is over the limit and nothing was recorded.
create function public.record_page_view(
  p_ip text, p_user_agent text, p_path text, p_referrer text, p_utm_source text,
  p_utm_medium text, p_utm_campaign text, p_country text, p_device text, p_browser text,
  p_os text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_salt bytea;
  v_visitor bytea;
  v_entry boolean;
begin
  select s.salt into v_salt from private.analytics_salts s where s.day = v_day;
  if v_salt is null then
    insert into private.analytics_salts(day, salt) values (v_day, extensions.gen_random_bytes(32))
    on conflict (day) do nothing;
    select s.salt into v_salt from private.analytics_salts s where s.day = v_day;
    delete from private.analytics_salts s where s.day < v_day;
  end if;
  v_visitor := substring(extensions.digest(
    v_salt || convert_to(coalesce(p_ip, '') || '|' || coalesce(p_user_agent, ''), 'UTF8'),
    'sha256') from 1 for 16);
  -- A visitor records at most 300 page views an hour.
  if (select count(*) from private.page_views v
      where v.visitor = v_visitor and v.created_at > now() - interval '1 hour') >= 300 then
    return false;
  end if;
  v_entry := not exists (select 1 from private.page_views v
    where v.visitor = v_visitor and v.created_at > now() - interval '30 minutes');
  insert into private.page_views(visitor, path, entry, referrer, utm_source, utm_medium,
    utm_campaign, country, device, browser, os)
  values (v_visitor, p_path, v_entry,
    case when v_entry then p_referrer end, case when v_entry then p_utm_source end,
    case when v_entry then p_utm_medium end, case when v_entry then p_utm_campaign end,
    p_country, p_device, p_browser, p_os);
  return true;
end;
$$;
revoke execute on function public.record_page_view(text, text, text, text, text, text, text, text,
  text, text, text) from public, anon, authenticated;
grant execute on function public.record_page_view(text, text, text, text, text, text, text, text,
  text, text, text) to service_role;

-- Totals for the admin panel over [p_from, p_to), in UTC hours, days or months, with the same
-- figures for the period of equal length before it. Admins only.
create function public.admin_analytics(p_from timestamptz, p_to timestamptz, p_bucket text)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_step interval;
  v_result jsonb;
begin
  perform private.require_admin();
  if p_bucket is null or p_bucket not in ('hour', 'day', 'month') then
    raise exception 'Choose hours, days or months';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Choose a period of up to 400 days';
  end if;
  v_step := ('1 ' || p_bucket)::interval;

  with views as materialized (
    select * from private.page_views v where v.created_at >= p_from and v.created_at < p_to
  ),
  previous as (
    select * from private.page_views v
    where v.created_at >= p_from - (p_to - p_from) and v.created_at < p_from
  ),
  counted as (
    select date_trunc(p_bucket, v.created_at) as start, count(distinct v.visitor) as visitors,
      count(*) as page_views
    from views v group by 1
  ),
  series as (
    select s.start, coalesce(c.visitors, 0) as visitors, coalesce(c.page_views, 0) as page_views
    from generate_series(date_trunc(p_bucket, p_from), p_to - interval '1 microsecond', v_step)
      as s(start)
    left join counted c on c.start = s.start
  )
  select jsonb_build_object(
    'visitors', (select count(distinct v.visitor) from views v),
    'visits', (select count(*) from views v where v.entry),
    'page_views', (select count(*) from views v),
    'previous', (select jsonb_build_object('visitors', count(distinct p.visitor),
      'visits', count(*) filter (where p.entry), 'page_views', count(*)) from previous p),
    'live', (select count(distinct v.visitor) from private.page_views v
      where v.created_at > now() - interval '30 minutes'),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('start', s.start,
      'visitors', s.visitors, 'page_views', s.page_views) order by s.start), '[]') from series s),
    'pages', (select coalesce(jsonb_agg(t order by t.page_views desc, t.path), '[]') from (
      select v.path, count(distinct v.visitor) as visitors, count(*) as page_views
      from views v group by v.path order by page_views desc, v.path limit 10) t),
    -- A visit's source is its campaign tag, else the site that linked to it; null is direct.
    'sources', (select coalesce(jsonb_agg(t order by t.visits desc, t.source nulls first), '[]')
      from (
      select coalesce(v.utm_source, v.referrer) as source, count(*) as visits
      from views v where v.entry group by 1 order by visits desc, source nulls first limit 10) t),
    'campaigns', (select coalesce(jsonb_agg(t order by t.visits desc, t.campaign), '[]') from (
      select v.utm_campaign as campaign, count(*) as visits
      from views v where v.entry and v.utm_campaign is not null
      group by 1 order by visits desc, campaign limit 10) t),
    'countries', (select coalesce(jsonb_agg(t order by t.visitors desc, t.country nulls last),
      '[]') from (
      select v.country, count(distinct v.visitor) as visitors
      from views v group by 1 order by visitors desc, country nulls last limit 10) t),
    'devices', (select coalesce(jsonb_agg(t order by t.visitors desc, t.device), '[]') from (
      select v.device, count(distinct v.visitor) as visitors
      from views v group by 1) t),
    'browsers', (select coalesce(jsonb_agg(t order by t.visitors desc, t.browser), '[]') from (
      select v.browser, count(distinct v.visitor) as visitors
      from views v group by 1 order by visitors desc, browser limit 8) t),
    'systems', (select coalesce(jsonb_agg(t order by t.visitors desc, t.os), '[]') from (
      select v.os, count(distinct v.visitor) as visitors
      from views v group by 1 order by visitors desc, os limit 8) t)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.admin_analytics(timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.admin_analytics(timestamptz, timestamptz, text) to authenticated;

-- Page views are kept 25 months, enough to compare a year with the one before. Salts of past days
-- go even on days without visits.
select cron.schedule('harbor-analytics-retention', '41 3 * * *', $$
  delete from private.page_views where created_at < now() - interval '25 months';
  delete from private.analytics_salts where day < (now() at time zone 'UTC')::date;
$$);

-- Detailed site statistics. Page views now belong to a visit (a session that ends after 30 quiet
-- minutes) and carry how long the page was visible, the city, the language, browser and system
-- versions and every campaign tag; clicks on links to other sites are counted too. Admins read
-- one report per card of the Analytics page, each for 24 hours, 7 days, 30 days, 12 months or all
-- time, in their own time zone. Visitors stay a daily hash, as in migration 20260926060000.
--
-- record_page_view() and admin_analytics() stay for the code that is live while this migration
-- is applied first; a later migration drops them.

alter table private.page_views
  add column visit bigint,
  add column engaged_ms integer check (engaged_ms is null or engaged_ms between 0 and 3600000),
  add column utm_term text
    check (utm_term is null or (entry and char_length(utm_term) between 1 and 100)),
  add column utm_content text
    check (utm_content is null or (entry and char_length(utm_content) between 1 and 100)),
  add column city text check (city is null or char_length(city) between 1 and 100),
  add column language text check (language is null or language ~ '^[a-z]{2,3}$'),
  add column browser_version text
    check (browser_version is null or browser_version ~ '^[0-9]{1,4}$'),
  add column os_version text check (os_version is null or os_version ~ '^[0-9]{1,4}$');

-- Earlier page views join the visit their latest entry started.
update private.page_views p set visit = o.visit
from (
  select v.id, coalesce(max(v.id) filter (where v.entry) over (
    partition by v.visitor order by v.created_at, v.id
    rows between unbounded preceding and current row), v.id) as visit
  from private.page_views v
) o
where o.id = p.id;
alter table private.page_views alter column visit set not null;
create index page_views_visit_idx on private.page_views(visit, created_at);

create table private.outbound_clicks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor bytea not null check (octet_length(visitor) = 16),
  visit bigint,
  -- The page the link was on, cleaned like page views.
  path text not null check (char_length(path) between 1 and 300 and path ~ '^/'),
  -- Where it led, without query or fragment.
  target text not null check (char_length(target) between 1 and 300 and target ~ '^https?://'),
  target_host text not null check (char_length(target_host) between 1 and 253)
);
create index outbound_clicks_created_idx on private.outbound_clicks(created_at);
create index outbound_clicks_visitor_idx on private.outbound_clicks(visitor, created_at);
alter table private.outbound_clicks enable row level security;
revoke all on private.outbound_clicks from public, anon, authenticated;

-- The visitor for today: the IP address and user agent hashed with the day's salt.
create function private.analytics_visitor(p_ip text, p_user_agent text) returns bytea
language plpgsql set search_path = '' as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_salt bytea;
begin
  select s.salt into v_salt from private.analytics_salts s where s.day = v_day;
  if v_salt is null then
    insert into private.analytics_salts(day, salt) values (v_day, extensions.gen_random_bytes(32))
    on conflict (day) do nothing;
    select s.salt into v_salt from private.analytics_salts s where s.day = v_day;
    delete from private.analytics_salts s where s.day < v_day;
  end if;
  return substring(extensions.digest(
    v_salt || convert_to(coalesce(p_ip, '') || '|' || coalesce(p_user_agent, ''), 'UTF8'),
    'sha256') from 1 for 16);
end;
$$;
revoke execute on function private.analytics_visitor(text, text) from public, anon, authenticated;

-- Records a page view and returns its id, which the browser uses to report the time the page was
-- visible, or null when the visitor is over 300 page views an hour. A page view continues the
-- visitor's visit unless 30 minutes passed since their last one; only a visit's first page keeps
-- where it came from.
create function public.track_page_view(
  p_ip text, p_user_agent text, p_path text, p_referrer text, p_utm_source text,
  p_utm_medium text, p_utm_campaign text, p_utm_term text, p_utm_content text, p_country text,
  p_city text, p_language text, p_device text, p_browser text, p_browser_version text,
  p_os text, p_os_version text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_visitor bytea := private.analytics_visitor(p_ip, p_user_agent);
  v_visit bigint;
  v_entry boolean;
  v_id bigint;
begin
  if (select count(*) from private.page_views v
      where v.visitor = v_visitor and v.created_at > now() - interval '1 hour') >= 300 then
    return null;
  end if;
  select v.visit into v_visit from private.page_views v
  where v.visitor = v_visitor and v.created_at > now() - interval '30 minutes'
  order by v.created_at desc, v.id desc limit 1;
  v_entry := v_visit is null;
  v_id := nextval(pg_get_serial_sequence('private.page_views', 'id')::regclass);
  insert into private.page_views(id, visitor, visit, path, entry, referrer, utm_source,
    utm_medium, utm_campaign, utm_term, utm_content, country, city, language, device, browser,
    browser_version, os, os_version)
  overriding system value
  values (v_id, v_visitor, coalesce(v_visit, v_id), p_path, v_entry,
    case when v_entry then p_referrer end, case when v_entry then p_utm_source end,
    case when v_entry then p_utm_medium end, case when v_entry then p_utm_campaign end,
    case when v_entry then p_utm_term end, case when v_entry then p_utm_content end,
    p_country, p_city, p_language, p_device, p_browser, p_browser_version, p_os, p_os_version);
  return v_id;
end;
$$;
revoke execute on function public.track_page_view(text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.track_page_view(text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text) to service_role;

-- The earlier entry point, for the code that is live until the next deployment.
create or replace function public.record_page_view(
  p_ip text, p_user_agent text, p_path text, p_referrer text, p_utm_source text,
  p_utm_medium text, p_utm_campaign text, p_country text, p_device text, p_browser text,
  p_os text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  return public.track_page_view(p_ip, p_user_agent, p_path, p_referrer, p_utm_source,
    p_utm_medium, p_utm_campaign, null, null, p_country, null, null, p_device, p_browser, null,
    p_os, null) is not null;
end;
$$;

-- How long a page was visible, reported by the browser as it hides or leaves the page. Only the
-- visitor who viewed the page, on the same day, can report it, and a report never shortens it.
create function public.track_engagement(p_ip text, p_user_agent text, p_id bigint,
  p_engaged_ms integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_visitor bytea := private.analytics_visitor(p_ip, p_user_agent);
begin
  update private.page_views v
  set engaged_ms = greatest(coalesce(v.engaged_ms, 0),
    least(greatest(coalesce(p_engaged_ms, 0), 0), 3600000))
  where v.id = p_id and v.visitor = v_visitor and v.created_at > now() - interval '1 day';
  return found;
end;
$$;
revoke execute on function public.track_engagement(text, text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.track_engagement(text, text, bigint, integer) to service_role;

-- A click on a link to another site. At most 100 an hour per visitor.
create function public.track_outbound_click(p_ip text, p_user_agent text, p_path text,
  p_target text, p_target_host text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_visitor bytea := private.analytics_visitor(p_ip, p_user_agent);
  v_visit bigint;
begin
  if (select count(*) from private.outbound_clicks o
      where o.visitor = v_visitor and o.created_at > now() - interval '1 hour') >= 100 then
    return false;
  end if;
  select v.visit into v_visit from private.page_views v
  where v.visitor = v_visitor and v.created_at > now() - interval '30 minutes'
  order by v.created_at desc, v.id desc limit 1;
  insert into private.outbound_clicks(visitor, visit, path, target, target_host)
  values (v_visitor, v_visit, p_path, p_target, p_target_host);
  return true;
end;
$$;
revoke execute on function public.track_outbound_click(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.track_outbound_click(text, text, text, text, text)
  to service_role;

-- Where a visit came from, as a channel. Campaign tags win over the referring site.
create function private.analytics_channel(p_referrer text, p_utm_source text, p_utm_medium text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_medium text := lower(coalesce(p_utm_medium, ''));
  v_source text := lower(coalesce(p_utm_source, ''));
  v_host text := lower(coalesce(p_referrer, ''));
begin
  if v_medium ~ '^(cpc|ppc|paid|paidsearch|paid[-_ ]?(search|social)|display|cpm|banner|ads?)$' then
    return 'Paid';
  end if;
  if v_medium in ('email', 'e-mail', 'newsletter') or v_source in ('email', 'newsletter')
    or v_host ~ '(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.proton\.me)$' then
    return 'Email';
  end if;
  if v_source ~ '^(chatgpt(\.com)?|openai|perplexity(\.ai)?|claude(\.ai)?|gemini|copilot)$'
    or v_host ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|phind\.com|poe\.com|you\.com|deepseek\.com|meta\.ai|grok\.com|mistral\.ai)$' then
    return 'AI assistants';
  end if;
  if v_medium in ('organic', 'search') or v_source ~ '^(google|bing|duckduckgo|yahoo|ecosia)$'
    or v_host ~ '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z.]+|baidu\.com|ecosia\.org|search\.brave\.com|startpage\.com|qwant\.com|naver\.com|seznam\.cz)$' then
    return 'Organic search';
  end if;
  if v_medium in ('social', 'social-media', 'social_media', 'sm')
    or v_source ~ '^(twitter|x|facebook|fb|instagram|linkedin|reddit|hackernews|hn|youtube|tiktok|threads|bluesky|mastodon|producthunt|indiehackers|discord|telegram)$'
    or v_host ~ '(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|reddit\.com|news\.ycombinator\.com|youtube\.com|youtu\.be|tiktok\.com|threads\.net|bsky\.app|mastodon\.social|pinterest\.[a-z.]+|quora\.com|discord\.com|discordapp\.com|t\.me|producthunt\.com|indiehackers\.com|medium\.com|substack\.com)$' then
    return 'Organic social';
  end if;
  if p_referrer is null and p_utm_source is null then
    return 'Direct';
  end if;
  return 'Referral';
end;
$$;
revoke execute on function private.analytics_channel(text, text, text)
  from public, anon, authenticated;

-- Where a visit came from, by name: known sites get their usual name, others their host or tag.
-- Null is a visit without either.
create function private.analytics_source(p_referrer text, p_utm_source text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v text := lower(coalesce(p_utm_source, p_referrer));
begin
  if v is null then
    return null;
  end if;
  return case
    when v ~ '(^|\.)mail\.google\.com$' then 'Gmail'
    when v ~ '(^|\.)gemini\.google\.com$' or v = 'gemini' then 'Gemini'
    when v ~ '(^|\.)google\.[a-z.]+$' or v = 'google' then 'Google'
    when v ~ '(^|\.)bing\.com$' or v = 'bing' then 'Bing'
    when v ~ '(^|\.)duckduckgo\.com$' or v = 'duckduckgo' then 'DuckDuckGo'
    when v ~ '(^|\.)yahoo\.com$' or v = 'yahoo' then 'Yahoo'
    when v ~ '(^|\.)yandex\.[a-z.]+$' then 'Yandex'
    when v ~ '(^|\.)baidu\.com$' then 'Baidu'
    when v ~ '(^|\.)ecosia\.org$' or v = 'ecosia' then 'Ecosia'
    when v ~ '(^|\.)search\.brave\.com$' then 'Brave Search'
    when v ~ '(^|\.)(chatgpt\.com|openai\.com)$' or v in ('chatgpt', 'openai') then 'ChatGPT'
    when v ~ '(^|\.)perplexity\.ai$' or v = 'perplexity' then 'Perplexity'
    when v ~ '(^|\.)claude\.ai$' or v = 'claude' then 'Claude'
    when v ~ '(^|\.)copilot\.microsoft\.com$' or v = 'copilot' then 'Copilot'
    when v ~ '(^|\.)(t\.co|x\.com|twitter\.com)$' or v in ('twitter', 'x') then 'X'
    when v ~ '(^|\.)(facebook\.com|fb\.com)$' or v in ('facebook', 'fb') then 'Facebook'
    when v ~ '(^|\.)instagram\.com$' or v = 'instagram' then 'Instagram'
    when v ~ '(^|\.)(linkedin\.com|lnkd\.in)$' or v = 'linkedin' then 'LinkedIn'
    when v ~ '(^|\.)reddit\.com$' or v = 'reddit' then 'Reddit'
    when v ~ '(^|\.)news\.ycombinator\.com$' or v in ('hackernews', 'hn') then 'Hacker News'
    when v ~ '(^|\.)(youtube\.com|youtu\.be)$' or v = 'youtube' then 'YouTube'
    when v ~ '(^|\.)tiktok\.com$' or v = 'tiktok' then 'TikTok'
    when v ~ '(^|\.)threads\.net$' or v = 'threads' then 'Threads'
    when v ~ '(^|\.)bsky\.app$' or v = 'bluesky' then 'Bluesky'
    when v ~ '(^|\.)producthunt\.com$' or v = 'producthunt' then 'Product Hunt'
    when v ~ '(^|\.)indiehackers\.com$' or v = 'indiehackers' then 'Indie Hackers'
    when v ~ '(^|\.)github\.com$' or v = 'github' then 'GitHub'
    when v ~ '(^|\.)medium\.com$' then 'Medium'
    when v ~ '(^|\.)substack\.com$' then 'Substack'
    when v ~ '(^|\.)(discord\.com|discordapp\.com)$' or v = 'discord' then 'Discord'
    when v ~ '(^|\.)(outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com)$' then 'Outlook'
    else coalesce(p_utm_source, p_referrer)
  end;
end;
$$;
revoke execute on function private.analytics_source(text, text) from public, anon, authenticated;

-- A report's period, ending now: the last 24 hours by hour, 7 or 30 days by day, 12 months by
-- week, or all time since p_first with buckets that fit its length. Whole buckets in the time
-- zone. The previous period is the same length just before, aligned to the same buckets; all time
-- has none.
create function private.analytics_period(p_range text, p_tz text, p_first timestamptz,
  out period_from timestamptz, out period_to timestamptz, out bucket text,
  out previous_from timestamptz, out previous_to timestamptz)
language plpgsql stable set search_path = '' as $$
declare
  v_now timestamp;
  v_start timestamp;
  v_back interval;
  v_span interval;
begin
  if p_tz is null then
    raise exception 'Choose a time zone';
  end if;
  v_now := now() at time zone p_tz;
  period_to := now();
  case p_range
    when '24h' then
      bucket := 'hour';
      v_start := date_trunc('hour', v_now) - interval '23 hours';
      v_back := interval '24 hours';
    when '7d' then
      bucket := 'day';
      v_start := date_trunc('day', v_now) - interval '6 days';
      v_back := interval '7 days';
    when '30d' then
      bucket := 'day';
      v_start := date_trunc('day', v_now) - interval '29 days';
      v_back := interval '30 days';
    when '12m' then
      bucket := 'week';
      v_start := date_trunc('week', v_now) - interval '51 weeks';
      v_back := interval '52 weeks';
    when 'all' then
      v_span := now() - coalesce(p_first, now());
      bucket := case
        when v_span <= interval '2 days' then 'hour'
        when v_span <= interval '92 days' then 'day'
        when v_span <= interval '2 years' then 'week'
        else 'month' end;
      v_start := date_trunc(bucket, coalesce(p_first, now()) at time zone p_tz);
    else
      raise exception 'Choose 24 hours, 7 days, 30 days, 12 months or all time';
  end case;
  period_from := v_start at time zone p_tz;
  if v_back is not null then
    previous_from := (v_start - v_back) at time zone p_tz;
    previous_to := previous_from + (period_to - period_from);
  end if;
end;
$$;
revoke execute on function private.analytics_period(text, text, timestamptz)
  from public, anon, authenticated;

-- The page views of a period, with the time each page was visible: the reported time, else the
-- time until the next page of the visit (at most 30 minutes), else unknown. The last page of a
-- visit in the period is its exit.
create function private.analytics_views(p_from timestamptz, p_to timestamptz)
returns table (id bigint, created_at timestamptz, visitor bytea, visit bigint, path text,
  time_ms integer, is_exit boolean)
language sql stable set search_path = '' as $$
  select v.id, v.created_at, v.visitor, v.visit, v.path,
    -- least() skips nulls, so the last page of a visit needs its own case.
    coalesce(v.engaged_ms, case when lead(v.id) over w is not null then least(
      extract(epoch from (lead(v.created_at) over w - v.created_at)) * 1000, 1800000)::integer end),
    lead(v.id) over w is null
  from private.page_views v
  where v.created_at >= p_from and v.created_at < p_to
  window w as (partition by v.visit order by v.created_at, v.id)
$$;
revoke execute on function private.analytics_views(timestamptz, timestamptz)
  from public, anon, authenticated;

-- The visits with page views in a period: their pages in the period, duration (the known times
-- of their pages), whether they bounced (one page), and where they came from and on what, from
-- the page that started them.
create function private.analytics_visits(p_from timestamptz, p_to timestamptz)
returns table (visit bigint, visitor bytea, started_at timestamptz, views bigint,
  duration_ms bigint, bounce boolean, entry_path text, exit_path text, channel text,
  source text, referrer text, utm_source text, utm_medium text, utm_campaign text,
  utm_term text, utm_content text, country text, city text, language text, device text,
  browser text, browser_version text, os text, os_version text)
language sql stable set search_path = '' as $$
  with grouped as (
    select v.visit, min(v.created_at) as started_at, count(*) as views,
      coalesce(sum(v.time_ms), 0)::bigint as duration_ms,
      (array_agg(v.path order by v.created_at desc, v.id desc))[1] as exit_path
    from private.analytics_views(p_from, p_to) v
    group by v.visit
  )
  select g.visit, e.visitor, g.started_at, g.views, g.duration_ms, g.views = 1, e.path,
    g.exit_path, private.analytics_channel(e.referrer, e.utm_source, e.utm_medium),
    private.analytics_source(e.referrer, e.utm_source), e.referrer, e.utm_source,
    e.utm_medium, e.utm_campaign, e.utm_term, e.utm_content, e.country, e.city, e.language,
    e.device, e.browser, e.browser_version, e.os, e.os_version
  from grouped g
  join private.page_views e on e.id = g.visit
$$;
revoke execute on function private.analytics_visits(timestamptz, timestamptz)
  from public, anon, authenticated;

-- Visitors, visits, page views, pages per visit, bounce rate (%) and average visit (seconds).
create function private.analytics_totals(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'visitors', (select count(distinct v.visitor) from private.page_views v
      where v.created_at >= p_from and v.created_at < p_to),
    'visits', count(*),
    'page_views', (select count(*) from private.page_views v
      where v.created_at >= p_from and v.created_at < p_to),
    'views_per_visit', case when count(*) > 0 then round(sum(s.views)::numeric / count(*), 2) end,
    'bounce_rate', case when count(*) > 0
      then round(100.0 * count(*) filter (where s.bounce) / count(*), 1) end,
    'visit_duration', case when count(*) > 0 then round(avg(s.duration_ms) / 1000.0, 1) end)
  from private.analytics_visits(p_from, p_to) s
$$;
revoke execute on function private.analytics_totals(timestamptz, timestamptz)
  from public, anon, authenticated;

-- The same figures per hour, day, week or month of the period, empty buckets included. Visits
-- count in the bucket they started in. Bucket starts are local times in the time zone.
create function private.analytics_series(p_from timestamptz, p_to timestamptz, p_tz text,
  p_bucket text)
returns jsonb language sql stable set search_path = '' as $$
  with views as (
    select date_trunc(p_bucket, v.created_at at time zone p_tz) as b, v.visitor
    from private.page_views v where v.created_at >= p_from and v.created_at < p_to
  ),
  visits as (
    select date_trunc(p_bucket, s.started_at at time zone p_tz) as b, s.views, s.duration_ms,
      s.bounce
    from private.analytics_visits(p_from, p_to) s
  ),
  vb as (select b, count(distinct visitor) as visitors, count(*) as page_views
    from views group by b),
  sb as (select b, count(*) as visits, sum(views) as total_views,
      count(*) filter (where bounce) as bounces, avg(duration_ms) as avg_ms
    from visits group by b),
  buckets as (
    select s as start from generate_series(date_trunc(p_bucket, p_from at time zone p_tz),
      (p_to at time zone p_tz) - interval '1 microsecond', ('1 ' || p_bucket)::interval) s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start', to_char(k.start, 'YYYY-MM-DD"T"HH24:MI'),
    'visitors', coalesce(vb.visitors, 0),
    'visits', coalesce(sb.visits, 0),
    'page_views', coalesce(vb.page_views, 0),
    'views_per_visit', case when sb.visits > 0
      then round(sb.total_views::numeric / sb.visits, 2) end,
    'bounce_rate', case when sb.visits > 0 then round(100.0 * sb.bounces / sb.visits, 1) end,
    'visit_duration', case when sb.visits > 0 then round(sb.avg_ms / 1000.0, 1) end
  ) order by k.start), '[]'::jsonb)
  from buckets k
  left join vb on vb.b = k.start
  left join sb on sb.b = k.start
$$;
revoke execute on function private.analytics_series(timestamptz, timestamptz, text, text)
  from public, anon, authenticated;

create function private.analytics_first_view() returns timestamptz
language sql stable set search_path = '' as $$
  select min(v.created_at) from private.page_views v
$$;
revoke execute on function private.analytics_first_view() from public, anon, authenticated;

-- The overview card: totals and their series, for the period and the one before it.
create function public.admin_analytics_overview(p_range text, p_tz text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  select * into p from private.analytics_period(p_range, p_tz, private.analytics_first_view());
  return jsonb_build_object(
    'range', p_range,
    'bucket', p.bucket,
    'from', to_char(p.period_from at time zone p_tz, 'YYYY-MM-DD"T"HH24:MI'),
    'totals', private.analytics_totals(p.period_from, p.period_to),
    'previous', case when p.previous_from is not null
      then private.analytics_totals(p.previous_from, p.previous_to) end,
    'series', private.analytics_series(p.period_from, p.period_to, p_tz, p.bucket),
    'previous_series', case when p.previous_from is not null
      then private.analytics_series(p.previous_from, p.previous_to, p_tz, p.bucket) end);
end;
$$;
revoke execute on function public.admin_analytics_overview(text, text) from public, anon;
grant execute on function public.admin_analytics_overview(text, text) to authenticated;

-- One breakdown, largest first, at most p_limit rows (1 to 100), with how many there are in all.
-- Pages count page views; entry pages, sources, places and devices count visits; exit pages
-- count the visits that ended there; outbound counts clicks.
create function public.admin_analytics_breakdown(p_range text, p_tz text, p_dimension text,
  p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_rows jsonb;
  v_count integer;
begin
  perform private.require_admin();
  select * into p from private.analytics_period(p_range, p_tz, private.analytics_first_view());

  if p_dimension = 'page' then
    with grouped as (
      select v.path as value, count(distinct v.visitor) as visitors, count(*) as page_views,
        round(avg(v.time_ms) / 1000.0, 1) as time_on_page
      from private.analytics_views(p.period_from, p.period_to) v
      group by v.path
    ), ranked as (
      select g.*, row_number() over (order by g.page_views desc, g.visitors desc, g.value) as n
      from grouped g
    )
    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('value', r.value,
      'visitors', r.visitors, 'page_views', r.page_views, 'time_on_page', r.time_on_page)
      order by r.n) filter (where r.n <= v_limit), '[]'::jsonb)
    into v_count, v_rows from ranked r;

  elsif p_dimension = 'exit_page' then
    with visits as (
      select * from private.analytics_visits(p.period_from, p.period_to)
    ), views as (
      select v.path, count(*) as page_views from private.page_views v
      where v.created_at >= p.period_from and v.created_at < p.period_to group by v.path
    ), grouped as (
      select s.exit_path as value, count(distinct s.visitor) as visitors, count(*) as exits
      from visits s group by s.exit_path
    ), ranked as (
      select g.*, round(100.0 * g.exits / nullif(w.page_views, 0), 1) as exit_rate,
        row_number() over (order by g.exits desc, g.visitors desc, g.value) as n
      from grouped g left join views w on w.path = g.value
    )
    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('value', r.value,
      'visitors', r.visitors, 'exits', r.exits, 'exit_rate', r.exit_rate)
      order by r.n) filter (where r.n <= v_limit), '[]'::jsonb)
    into v_count, v_rows from ranked r;

  elsif p_dimension = 'outbound' then
    with grouped as (
      select o.target as value, o.target_host as detail, count(distinct o.visitor) as visitors,
        count(*) as clicks
      from private.outbound_clicks o
      where o.created_at >= p.period_from and o.created_at < p.period_to
      group by o.target, o.target_host
    ), ranked as (
      select g.*, row_number() over (order by g.clicks desc, g.visitors desc, g.value) as n
      from grouped g
    )
    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('value', r.value,
      'detail', r.detail, 'visitors', r.visitors, 'clicks', r.clicks)
      order by r.n) filter (where r.n <= v_limit), '[]'::jsonb)
    into v_count, v_rows from ranked r;

  elsif p_dimension in ('entry_page', 'channel', 'source', 'referrer', 'utm_source',
      'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'country', 'city', 'language',
      'device', 'browser', 'browser_version', 'os', 'os_version') then
    with keyed as (
      select s.visitor, s.bounce, s.duration_ms,
        case p_dimension
          when 'entry_page' then s.entry_path
          when 'channel' then s.channel
          when 'source' then s.source
          when 'referrer' then s.referrer
          when 'utm_source' then s.utm_source
          when 'utm_medium' then s.utm_medium
          when 'utm_campaign' then s.utm_campaign
          when 'utm_term' then s.utm_term
          when 'utm_content' then s.utm_content
          when 'country' then s.country
          when 'city' then s.city
          when 'language' then s.language
          when 'device' then s.device
          when 'browser' then s.browser
          when 'browser_version' then s.browser || coalesce(' ' || s.browser_version, '')
          when 'os' then s.os
          when 'os_version' then s.os || coalesce(' ' || s.os_version, '')
        end as value,
        case when p_dimension = 'city' then s.country end as detail
      from private.analytics_visits(p.period_from, p.period_to) s
    ), grouped as (
      select k.value, k.detail, count(distinct k.visitor) as visitors, count(*) as visits,
        round(100.0 * count(*) filter (where k.bounce) / count(*), 1) as bounce_rate,
        round(avg(k.duration_ms) / 1000.0, 1) as visit_duration
      from keyed k
      -- Campaign tags list only tagged visits.
      where k.value is not null or p_dimension not like 'utm\_%'
      group by k.value, k.detail
    ), ranked as (
      select g.*, row_number() over (
        order by g.visitors desc, g.visits desc, g.value nulls last, g.detail) as n
      from grouped g
    )
    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('value', r.value,
      'detail', r.detail, 'visitors', r.visitors, 'visits', r.visits,
      'bounce_rate', r.bounce_rate, 'visit_duration', r.visit_duration)
      order by r.n) filter (where r.n <= v_limit), '[]'::jsonb)
    into v_count, v_rows from ranked r;

  else
    raise exception 'Choose a breakdown';
  end if;

  return jsonb_build_object(
    'range', p_range,
    'dimension', p_dimension,
    'total', v_count,
    'visitors', (select count(distinct v.visitor) from private.page_views v
      where v.created_at >= p.period_from and v.created_at < p.period_to),
    'rows', v_rows);
end;
$$;
revoke execute on function public.admin_analytics_breakdown(text, text, text, integer)
  from public, anon;
grant execute on function public.admin_analytics_breakdown(text, text, text, integer)
  to authenticated;

-- Visitors and page views by weekday (1 is Monday) and hour, in the time zone.
create function public.admin_analytics_heatmap(p_range text, p_tz text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  select * into p from private.analytics_period(p_range, p_tz, private.analytics_first_view());
  return jsonb_build_object(
    'range', p_range,
    'cells', (select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'hour', t.hour,
      'visitors', t.visitors, 'page_views', t.page_views) order by t.day, t.hour), '[]'::jsonb)
      from (
        select extract(isodow from v.created_at at time zone p_tz)::integer as day,
          extract(hour from v.created_at at time zone p_tz)::integer as hour,
          count(distinct v.visitor) as visitors, count(*) as page_views
        from private.page_views v
        where v.created_at >= p.period_from and v.created_at < p.period_to
        group by 1, 2
      ) t));
end;
$$;
revoke execute on function public.admin_analytics_heatmap(text, text) from public, anon;
grant execute on function public.admin_analytics_heatmap(text, text) to authenticated;

-- How visits went: pages per visit and visit length, in fixed groups, and the average time on a
-- page.
create function public.admin_analytics_behavior(p_range text, p_tz text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  perform private.require_admin();
  select * into p from private.analytics_period(p_range, p_tz, private.analytics_first_view());
  return (
    with visits as (select * from private.analytics_visits(p.period_from, p.period_to))
    select jsonb_build_object(
      'range', p_range,
      'visits', count(*),
      'pages', jsonb_build_array(
        jsonb_build_object('key', '1', 'visits', count(*) filter (where s.views = 1)),
        jsonb_build_object('key', '2', 'visits', count(*) filter (where s.views = 2)),
        jsonb_build_object('key', '3-5', 'visits', count(*) filter (where s.views between 3 and 5)),
        jsonb_build_object('key', '6-10', 'visits', count(*) filter (where s.views between 6 and 10)),
        jsonb_build_object('key', '11+', 'visits', count(*) filter (where s.views > 10))),
      'durations', jsonb_build_array(
        jsonb_build_object('key', '0-10s', 'visits', count(*) filter (where s.duration_ms < 10000)),
        jsonb_build_object('key', '10-30s', 'visits',
          count(*) filter (where s.duration_ms >= 10000 and s.duration_ms < 30000)),
        jsonb_build_object('key', '30-60s', 'visits',
          count(*) filter (where s.duration_ms >= 30000 and s.duration_ms < 60000)),
        jsonb_build_object('key', '1-3m', 'visits',
          count(*) filter (where s.duration_ms >= 60000 and s.duration_ms < 180000)),
        jsonb_build_object('key', '3-10m', 'visits',
          count(*) filter (where s.duration_ms >= 180000 and s.duration_ms < 600000)),
        jsonb_build_object('key', '10-30m', 'visits',
          count(*) filter (where s.duration_ms >= 600000 and s.duration_ms < 1800000)),
        jsonb_build_object('key', '30m+', 'visits', count(*) filter (where s.duration_ms >= 1800000))),
      'time_on_page', (select round(avg(v.time_ms) / 1000.0, 1)
        from private.analytics_views(p.period_from, p.period_to) v))
    from visits s);
end;
$$;
revoke execute on function public.admin_analytics_behavior(text, text) from public, anon;
grant execute on function public.admin_analytics_behavior(text, text) to authenticated;

-- The last 30 minutes: visitors now (the last 5 minutes), page views per minute, and the pages,
-- sources and countries of the moment.
create function public.admin_analytics_live() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (
    with recent as materialized (
      select * from private.page_views v where v.created_at > now() - interval '30 minutes'
    )
    select jsonb_build_object(
      'current', (select count(distinct r.visitor) from recent r
        where r.created_at > now() - interval '5 minutes'),
      'visitors', (select count(distinct r.visitor) from recent r),
      'page_views', (select count(*) from recent r),
      'minutes', (select jsonb_agg(jsonb_build_object('ago', m.ago,
          'page_views', coalesce(c.page_views, 0), 'visitors', coalesce(c.visitors, 0))
          order by m.ago desc)
        from generate_series(0, 29) as m(ago)
        left join (
          select least(floor(extract(epoch from now() - r.created_at) / 60), 29)::integer as ago,
            count(*) as page_views, count(distinct r.visitor) as visitors
          from recent r group by 1
        ) c on c.ago = m.ago),
      'pages', (select coalesce(jsonb_agg(jsonb_build_object('value', t.path,
          'visitors', t.visitors) order by t.visitors desc, t.path), '[]'::jsonb)
        from (select r.path, count(distinct r.visitor) as visitors from recent r
          group by r.path order by visitors desc, r.path limit 8) t),
      'sources', (select coalesce(jsonb_agg(jsonb_build_object('value', t.source,
          'visits', t.visits) order by t.visits desc, t.source nulls first), '[]'::jsonb)
        from (select private.analytics_source(r.referrer, r.utm_source) as source,
            count(*) as visits
          from recent r where r.entry group by 1 order by visits desc, source nulls first
          limit 5) t),
      'countries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.country,
          'visitors', t.visitors) order by t.visitors desc, t.country nulls last), '[]'::jsonb)
        from (select r.country, count(distinct r.visitor) as visitors from recent r
          group by r.country order by visitors desc, r.country nulls last limit 5) t))
  );
end;
$$;
revoke execute on function public.admin_analytics_live() from public, anon;
grant execute on function public.admin_analytics_live() to authenticated;

-- What happened on the platform in a period: sign-ups, products, provider connections,
-- messages, reports and feedback, and sign-ups per 100 visitors. Deleted accounts and products
-- are gone from the counts.
create function private.platform_totals(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  with counts as (
    select
      (select count(*) from auth.users u where u.created_at >= p_from and u.created_at < p_to)
        as sign_ups,
      (select count(*) from public.saas s where s.created_at >= p_from and s.created_at < p_to)
        as products,
      (select count(*) from public.revenue_connections c
        where c.connected_at >= p_from and c.connected_at < p_to) as connections,
      (select count(*) from public.messages m
        where m.created_at >= p_from and m.created_at < p_to) as messages,
      (select count(*) from public.reports r
        where r.created_at >= p_from and r.created_at < p_to) as reports,
      (select count(*) from public.feedback f
        where f.created_at >= p_from and f.created_at < p_to) as feedback,
      (select count(distinct v.visitor) from private.page_views v
        where v.created_at >= p_from and v.created_at < p_to) as visitors
  )
  select jsonb_build_object('sign_ups', c.sign_ups, 'products', c.products,
    'connections', c.connections, 'messages', c.messages, 'reports', c.reports,
    'feedback', c.feedback,
    'conversion_rate', case when c.visitors > 0 then round(100.0 * c.sign_ups / c.visitors, 2) end)
  from counts c
$$;
revoke execute on function private.platform_totals(timestamptz, timestamptz)
  from public, anon, authenticated;

create function private.platform_series(p_from timestamptz, p_to timestamptz, p_tz text,
  p_bucket text)
returns jsonb language sql stable set search_path = '' as $$
  with buckets as (
    select s as start from generate_series(date_trunc(p_bucket, p_from at time zone p_tz),
      (p_to at time zone p_tz) - interval '1 microsecond', ('1 ' || p_bucket)::interval) s
  ),
  events as (
    select 'sign_ups' as kind, u.created_at as at from auth.users u
      where u.created_at >= p_from and u.created_at < p_to
    union all
    select 'products', s.created_at from public.saas s
      where s.created_at >= p_from and s.created_at < p_to
    union all
    select 'connections', c.connected_at from public.revenue_connections c
      where c.connected_at >= p_from and c.connected_at < p_to
    union all
    select 'messages', m.created_at from public.messages m
      where m.created_at >= p_from and m.created_at < p_to
  ),
  counted as (
    select date_trunc(p_bucket, e.at at time zone p_tz) as b,
      count(*) filter (where e.kind = 'sign_ups') as sign_ups,
      count(*) filter (where e.kind = 'products') as products,
      count(*) filter (where e.kind = 'connections') as connections,
      count(*) filter (where e.kind = 'messages') as messages
    from events e group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start', to_char(k.start, 'YYYY-MM-DD"T"HH24:MI'),
    'sign_ups', coalesce(c.sign_ups, 0), 'products', coalesce(c.products, 0),
    'connections', coalesce(c.connections, 0), 'messages', coalesce(c.messages, 0)
  ) order by k.start), '[]'::jsonb)
  from buckets k left join counted c on c.b = k.start
$$;
revoke execute on function private.platform_series(timestamptz, timestamptz, text, text)
  from public, anon, authenticated;

create function public.admin_analytics_platform(p_range text, p_tz text) returns jsonb
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
      'ranked', (select count(*) from public.leaderboard),
      'mrr_cents', (select coalesce(sum(l.mrr_cents), 0) from public.leaderboard l),
      'connections', (select count(*) from public.revenue_connections)),
    'totals', private.platform_totals(p.period_from, p.period_to),
    'previous', case when p.previous_from is not null
      then private.platform_totals(p.previous_from, p.previous_to) end,
    'series', private.platform_series(p.period_from, p.period_to, p_tz, p.bucket),
    'previous_series', case when p.previous_from is not null
      then private.platform_series(p.previous_from, p.previous_to, p_tz, p.bucket) end);
end;
$$;
revoke execute on function public.admin_analytics_platform(text, text) from public, anon;
grant execute on function public.admin_analytics_platform(text, text) to authenticated;

-- Outbound clicks are kept as long as page views.
select cron.schedule('harbor-analytics-retention', '41 3 * * *', $$
  delete from private.page_views where created_at < now() - interval '25 months';
  delete from private.outbound_clicks where created_at < now() - interval '25 months';
  delete from private.analytics_salts where day < (now() at time zone 'UTC')::date;
$$);

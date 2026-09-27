-- More precise page time and visits.
--
-- Page time was reported by the page view's id, which the browser learned only from the server's
-- answer, and only from the same IP address and user agent on the same UTC day. Time on a page left
-- before the answer came, or reported after a change of network or midnight, was lost. The browser
-- now gives each page view a random key of its own (`key`) and reports the time with it
-- (track_page_time). The key is known only to that page, so nothing else is needed to prove the
-- report is its own; it is kept for a day and then cleared.
--
-- A visit ended 30 minutes after its last page view, even while the visitor was still reading, so
-- the next page started a new visit that counted as direct. The time a page was visible now counts
-- as activity too: a visit goes on while its visitor was active in the last 30 minutes. The browser
-- sends the page before's time with the next page view, so it counts before the visit is decided.
--
-- A visit without any known page time had a length of 0, which pulled averages down and put visits
-- among the shortest. Its length is now unknown: averages leave it out, and the lengths report
-- counts it on its own.
--
-- track_engagement() stays for the code that is live while this migration is applied first; a later
-- migration drops it.

alter table private.page_views add column key uuid;
create unique index page_views_key_idx on private.page_views(key) where key is not null;

-- track_page_view() from migration 20260926080000 now also takes the page view's key. It defaults to
-- null, so the code that is live while this migration is applied first keeps working.
drop function public.track_page_view(text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, uuid);
create function public.track_page_view(
  p_ip text, p_user_agent text, p_path text, p_referrer text, p_utm_source text,
  p_utm_medium text, p_utm_campaign text, p_utm_term text, p_utm_content text, p_country text,
  p_city text, p_language text, p_device text, p_browser text, p_browser_version text,
  p_os text, p_os_version text, p_viewer uuid default null, p_key uuid default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_visitor bytea := private.analytics_visitor(p_ip, p_user_agent);
  v_visit bigint;
  v_entry boolean;
  v_id bigint;
  v_saas uuid;
begin
  if (select count(*) from private.page_views v
      where v.visitor = v_visitor and v.created_at > now() - interval '1 hour') >= 300 then
    return null;
  end if;
  -- The visit goes on while its visitor was active in the last 30 minutes: a page view, or the
  -- time a page stayed visible after it. Page time is at most an hour, which bounds the search.
  select v.visit into v_visit from private.page_views v
  where v.visitor = v_visitor and v.created_at > now() - interval '90 minutes'
    and v.created_at + coalesce(v.engaged_ms, 0) * interval '1 millisecond'
      > now() - interval '30 minutes'
  order by v.created_at desc, v.id desc limit 1;
  v_entry := v_visit is null;
  v_id := nextval(pg_get_serial_sequence('private.page_views', 'id')::regclass);
  insert into private.page_views(id, visitor, visit, key, path, entry, referrer, utm_source,
    utm_medium, utm_campaign, utm_term, utm_content, country, city, language, device, browser,
    browser_version, os, os_version)
  overriding system value
  values (v_id, v_visitor, coalesce(v_visit, v_id),
    -- A key that is already taken is not given twice; that page's time then goes unreported.
    case when not exists (select 1 from private.page_views k where k.key = p_key) then p_key end,
    p_path, v_entry,
    case when v_entry then p_referrer end, case when v_entry then p_utm_source end,
    case when v_entry then p_utm_medium end, case when v_entry then p_utm_campaign end,
    case when v_entry then p_utm_term end, case when v_entry then p_utm_content end,
    p_country, p_city, p_language, p_device, p_browser, p_browser_version, p_os, p_os_version);

  -- A product's page counts for the product when visitors can see it there.
  if p_path ~ '^/saas/[a-z0-9]+(-[a-z0-9]+)*$' then
    select s.id into v_saas
    from public.saas s join public.profiles p on p.id = s.owner_id
    where s.slug = substr(p_path, 7) and s.hidden_at is null and p.suspended_at is null
      and s.owner_id is distinct from p_viewer;
    if v_saas is not null then
      insert into private.saas_page_views as c (saas_id, day, views)
      values (v_saas, (now() at time zone 'UTC')::date, 1)
      on conflict (saas_id, day) do update set views = c.views + 1;
    end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.track_page_view(text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.track_page_view(text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, uuid) to service_role;

-- How long a page was visible, reported by the browser with the key it gave the page view, as it
-- hides or leaves the page. Taken for a day; a report never shortens the time, which is at most an
-- hour.
create function public.track_page_time(p_key uuid, p_engaged_ms integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.page_views v
  set engaged_ms = greatest(coalesce(v.engaged_ms, 0),
    least(greatest(coalesce(p_engaged_ms, 0), 0), 3600000))
  where v.key = p_key and v.created_at > now() - interval '1 day';
  return found;
end;
$$;
revoke execute on function public.track_page_time(uuid, integer) from public, anon, authenticated;
grant execute on function public.track_page_time(uuid, integer) to service_role;

-- The visits with page views in a period: their pages in the period, duration (the sum of the
-- known times of their pages, unknown when none is known), whether they bounced (one page), and
-- where they came from and on what, from the page that started them.
create or replace function private.analytics_visits(p_from timestamptz, p_to timestamptz)
returns table (visit bigint, visitor bytea, started_at timestamptz, views bigint,
  duration_ms bigint, bounce boolean, entry_path text, exit_path text, channel text,
  source text, referrer text, utm_source text, utm_medium text, utm_campaign text,
  utm_term text, utm_content text, country text, city text, language text, device text,
  browser text, browser_version text, os text, os_version text)
language sql stable set search_path = '' as $$
  with grouped as (
    select v.visit, min(v.created_at) as started_at, count(*) as views,
      sum(v.time_ms)::bigint as duration_ms,
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

-- How visits went: pages per visit and visit length, in fixed groups (visits of unknown length on
-- their own), and the average time on a page.
create or replace function public.admin_analytics_behavior(p_range text, p_tz text) returns jsonb
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
        jsonb_build_object('key', '30m+', 'visits', count(*) filter (where s.duration_ms >= 1800000)),
        jsonb_build_object('key', 'unknown', 'visits', count(*) filter (where s.duration_ms is null))),
      'time_on_page', (select round(avg(v.time_ms) / 1000.0, 1)
        from private.analytics_views(p.period_from, p.period_to) v))
    from visits s);
end;
$$;

-- Page view keys are needed only while page time can be reported, so they are cleared after a day.
select cron.schedule('harbor-analytics-retention', '41 3 * * *', $$
  delete from private.page_views where created_at < now() - interval '25 months';
  delete from private.outbound_clicks where created_at < now() - interval '25 months';
  delete from private.analytics_salts where day < (now() at time zone 'UTC')::date;
  update private.page_views set key = null
  where key is not null and created_at < now() - interval '1 day';
$$);

-- How often a product's page was viewed, for its founder. A page view of /saas/<slug> of a listed
-- product also adds one to that product's count for the UTC day, unless the signed-in founder
-- viewed their own page. The counts hold no visitor data, are kept as long as the product and go
-- with it, so all-time totals outlast the 25 months page views are kept. Only the founder reads
-- them, on the product's page.

create table private.saas_page_views (
  saas_id uuid not null references public.saas(id) on delete cascade,
  day date not null,
  views integer not null check (views > 0),
  primary key (saas_id, day)
);
alter table private.saas_page_views enable row level security;
revoke all on private.saas_page_views from public, anon, authenticated;

-- track_page_view() from migration 20260926070000 now also takes the signed-in viewer, used only
-- to leave out a founder's views of their own product and never stored. It defaults to null, so
-- the code that is live while this migration is applied first keeps working.
drop function public.track_page_view(text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text);
create function public.track_page_view(
  p_ip text, p_user_agent text, p_path text, p_referrer text, p_utm_source text,
  p_utm_medium text, p_utm_campaign text, p_utm_term text, p_utm_content text, p_country text,
  p_city text, p_language text, p_device text, p_browser text, p_browser_version text,
  p_os text, p_os_version text, p_viewer uuid default null
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
  text, text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.track_page_view(text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid) to service_role;

-- Page views recorded before this migration count too, by the rule above for their page's current
-- address. Who viewed them is not known, so a founder's own earlier views are included.
insert into private.saas_page_views(saas_id, day, views)
select s.id, (v.created_at at time zone 'UTC')::date, count(*)
from private.page_views v
join public.saas s on v.path = '/saas/' || s.slug
join public.profiles p on p.id = s.owner_id
where s.hidden_at is null and p.suspended_at is null
group by 1, 2;

-- A product's views for its founder: the last 7 and 30 UTC days, today included, and all time.
create function public.saas_page_view_counts(p_saas uuid)
returns table (last_7_days bigint, last_30_days bigint, all_time bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
begin
  if not exists (select 1 from public.saas s where s.id = p_saas and s.owner_id = auth.uid()) then
    raise exception 'Only the founder sees how often a product was viewed' using errcode = '42501';
  end if;
  return query
  select coalesce(sum(c.views) filter (where c.day > v_today - 7), 0)::bigint,
    coalesce(sum(c.views) filter (where c.day > v_today - 30), 0)::bigint,
    coalesce(sum(c.views), 0)::bigint
  from private.saas_page_views c where c.saas_id = p_saas;
end;
$$;
revoke execute on function public.saas_page_view_counts(uuid) from public, anon;
grant execute on function public.saas_page_view_counts(uuid) to authenticated;

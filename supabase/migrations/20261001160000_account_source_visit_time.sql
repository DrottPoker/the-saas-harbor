-- An account's source no longer keeps when its visit began (the project review of 2026-10-01).
-- That time was the created_at of the visit's first page view, to the microsecond, so it found
-- the account's visits in the site statistics, which the privacy policy keeps apart from
-- accounts. Nothing showed it. The referrer, campaign tags and first page stay.

-- 1. Recording a source copies only where the visit came from; otherwise as in 20260927160000.
create or replace function public.record_account_source(p_user uuid, p_ip text, p_user_agent text)
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
  insert into private.account_sources(user_id, entry_path, referrer, utm_source, utm_medium,
    utm_campaign, utm_term, utm_content)
  values (p_user, v_entry.path, v_entry.referrer, v_entry.utm_source, v_entry.utm_medium,
    v_entry.utm_campaign, v_entry.utm_term, v_entry.utm_content)
  on conflict (user_id) do nothing;
  return found;
end;
$$;

-- 2. An account's page without the visit's time.
drop function public.admin_account(uuid);
create function public.admin_account(p_id uuid)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, is_admin boolean, country text, country_at timestamptz,
  source_channel text, source_name text, source_campaign text, source_entry_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    exists (select 1 from private.admins a where a.user_id = u.id), c.country, c.signed_in_at,
    case when s.user_id is not null
      then private.analytics_channel(s.referrer, s.utm_source, s.utm_medium) end,
    private.analytics_source(s.referrer, s.utm_source), s.utm_campaign, s.entry_path
  from auth.users u
  left join private.sign_in_countries c on c.user_id = u.id
  left join private.account_sources s on s.user_id = u.id
  where u.id = p_id;
end;
$$;
revoke execute on function public.admin_account(uuid) from public, anon, service_role;
grant execute on function public.admin_account(uuid) to authenticated;

-- 3. The times already kept go with the column.
alter table private.account_sources drop column visit_started_at;

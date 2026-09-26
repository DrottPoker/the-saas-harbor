-- Screenshots of founders' websites (migration 20260926110000) are removed at the project owner's
-- request, the same day they were added: they gave little over the link to the website. None
-- had been taken in production, so no stored file is left behind.

-- 1. The scheduled run and everything it used.
select cron.unschedule('harbor-screenshots');

drop trigger saas_screenshot_row on public.saas;
drop trigger saas_screenshot_website on public.saas;
drop trigger saas_settings_screenshot on public.saas_settings;
drop function public.saas_screenshot_status(uuid);
drop function public.request_screenshot(uuid);
drop function public.claim_due_screenshots(integer, uuid);
drop function public.record_screenshot(uuid, text, text, text);
drop function public.take_stale_screenshots(integer);
drop function private.screenshot_setting_changed();
drop function private.saas_screenshot_website();
drop function private.add_saas_screenshot();
drop function private.drop_screenshot(uuid);
drop table private.screenshot_deletions;
drop table private.saas_screenshots;

-- 2. The public views lose the screenshot columns. A view cannot drop columns in place, so the
-- views that read public_saas are made again as they were, with their grants.
drop view public.tech_counts;
drop view public.category_counts;
drop view public.leaderboard;
drop view public.public_saas;

alter table public.saas drop column screenshot_path, drop column screenshot_taken_at;
alter table public.saas_settings drop column show_screenshot;

create view public.public_saas with (security_invoker = true) as
select s.id, s.owner_id, s.name, s.tagline, s.description, s.category, s.website, s.logo_path,
  s.created_at, s.updated_at, p.name as owner_name, p.avatar_path as owner_avatar_path,
  case when m.verified_at > now() - interval '7 days' then m.mrr_cents end as mrr_cents,
  case when m.verified_at > now() - interval '7 days' then m.customers end as customers,
  m.launched_on, m.verified_at, m.livemode,
  case
    when m.verified_at is null then 'unverified'
    when m.verified_at <= now() - interval '7 days' then 'stale'
    when m.mrr_cents is null then 'private'
    else 'verified'
  end as revenue_status,
  case when m.verified_at > now() - interval '7 days' then m.mrr_history end as mrr_history,
  case when m.verified_at > now() - interval '7 days' then m.mrr_growth_pct end as mrr_growth_pct,
  s.slug, p.slug as owner_slug, m.provider, s.tech_stack, s.verified_domain, s.domain_verified_at
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

create view public.category_counts with (security_invoker = true) as
select category,
  count(*)::integer as products,
  (count(*) filter (where revenue_status = 'verified'))::integer as ranked
from public.public_saas
group by category;

create view public.tech_counts with (security_invoker = true) as
select t.tech,
  count(*)::integer as products,
  (count(*) filter (where s.revenue_status = 'verified'))::integer as ranked
from public.public_saas s
cross join lateral unnest(s.tech_stack) as t(tech)
group by t.tech;

grant select on public.public_saas, public.leaderboard, public.category_counts,
  public.tech_counts to anon, authenticated;

-- 3. The maker save goes back to taking the tech stack as its last, optional parameter.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean);
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_mrr boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profiles(id, name) values (actor, 'Harbor maker') on conflict (id) do nothing;
  insert into public.saas(id, owner_id, name, tagline, description, category, website, logo_path,
    tech_stack)
  values (p_id, actor, p_name, p_tagline, p_description, p_category, p_website, p_logo_path,
    coalesce(p_tech_stack, '{}'))
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline,
    description = excluded.description, category = excluded.category, website = excluded.website,
    logo_path = excluded.logo_path,
    tech_stack = coalesce(p_tech_stack, public.saas.tech_stack), updated_at = now()
  where public.saas.owner_id = actor returning id into saved_id;
  if saved_id is null then raise exception 'Not the owner' using errcode = '42501'; end if;
  insert into public.saas_settings(saas_id, owner_id, share_mrr, share_customers, launched_on, share_launch)
  values (saved_id, actor, p_share_mrr, p_share_customers, p_launched_on, p_share_launch)
  on conflict (saas_id) do update set share_mrr = excluded.share_mrr,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch, updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[]) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[]) to authenticated;

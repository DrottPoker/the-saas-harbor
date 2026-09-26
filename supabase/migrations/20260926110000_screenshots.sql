-- A screenshot of each product's landing page, which the app takes with a headless browser: soon
-- after the product is listed or its website changes, again every 30 days, and when the founder
-- asks. The image is stored in the founder's own folder in profile-images, so deleting the account
-- removes it. Founders may turn the screenshot off.

-- 1. The public screenshot on the product, which makers cannot write. Its path names a file
-- directly in the founder's folder, like a logo's.
alter table public.saas
  add column screenshot_path text
    constraint saas_screenshot_path_format check (screenshot_path is null or
      screenshot_path ~ ('^' || owner_id::text || '/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$')),
  add column screenshot_taken_at timestamptz,
  add constraint saas_screenshot_taken check ((screenshot_path is null) = (screenshot_taken_at is null));

-- The founder's choice, with the other visibility settings.
alter table public.saas_settings add column show_screenshot boolean not null default true;

-- 2. Per product: since when a new screenshot is wanted, the attempts since the last success
-- (each waits longer before the next), and the last failure for the founder.
create table private.saas_screenshots (
  saas_id uuid primary key references public.saas(id) on delete cascade,
  requested_at timestamptz default now(),
  attempted_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 300)
);
alter table private.saas_screenshots enable row level security;
revoke all on private.saas_screenshots from public, anon, authenticated;
grant select, insert, update, delete on private.saas_screenshots to service_role;
insert into private.saas_screenshots(saas_id) select id from public.saas;

-- Files that screenshots no longer use, which the next run deletes from storage. They are kept
-- apart from the product, so deleting the product in the meantime leaves none behind.
create table private.screenshot_deletions (
  path text primary key,
  queued_at timestamptz not null default now()
);
alter table private.screenshot_deletions enable row level security;
revoke all on private.screenshot_deletions from public, anon, authenticated;
grant select, insert, update, delete on private.screenshot_deletions to service_role;

create function private.add_saas_screenshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.saas_screenshots(saas_id) values (new.id);
  return null;
end;
$$;
revoke execute on function private.add_saas_screenshot() from public, anon, authenticated;
create trigger saas_screenshot_row after insert on public.saas
  for each row execute function private.add_saas_screenshot();

-- Takes a product's screenshot off its page, leaving the file for the next run to delete.
create function private.drop_screenshot(p_saas uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  select screenshot_path into v_path from public.saas where id = p_saas;
  if v_path is null then return; end if;
  update public.saas set screenshot_path = null, screenshot_taken_at = null where id = p_saas;
  insert into private.screenshot_deletions(path) values (v_path) on conflict do nothing;
end;
$$;
revoke execute on function private.drop_screenshot(uuid) from public, anon, authenticated;

-- 3. A new website takes the old screenshot off at once and asks for a new one.
create function private.saas_screenshot_website() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  if new.website is distinct from old.website then
    v_path := old.screenshot_path;
    new.screenshot_path := null;
    new.screenshot_taken_at := null;
    update private.saas_screenshots set requested_at = now(), attempts = 0, attempted_at = null,
      last_error = null
    where saas_id = new.id;
    if v_path is not null then
      insert into private.screenshot_deletions(path) values (v_path) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.saas_screenshot_website() from public, anon, authenticated;
create trigger saas_screenshot_website before update of website on public.saas
  for each row execute function private.saas_screenshot_website();

-- Turning the screenshot off takes it off the page; turning it on asks for a new one.
create function private.screenshot_setting_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.show_screenshot is distinct from old.show_screenshot then
    if new.show_screenshot then
      update private.saas_screenshots set requested_at = now(), attempts = 0,
        attempted_at = null, last_error = null
      where saas_id = new.saas_id;
    else
      perform private.drop_screenshot(new.saas_id);
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.screenshot_setting_changed() from public, anon, authenticated;
create trigger saas_settings_screenshot after update of show_screenshot on public.saas_settings
  for each row execute function private.screenshot_setting_changed();

-- 4. The founder reads how their screenshot is doing, and asks for a new one at most every ten
-- minutes.
create function public.saas_screenshot_status(p_saas uuid)
returns table(requested_at timestamptz, attempted_at timestamptz, last_error text)
language sql stable security definer set search_path = '' as $$
  select d.requested_at, d.attempted_at, d.last_error
  from private.saas_screenshots d
  join public.saas s on s.id = d.saas_id
  where d.saas_id = p_saas and s.owner_id = (select auth.uid());
$$;
revoke execute on function public.saas_screenshot_status(uuid) from public, anon;
grant execute on function public.saas_screenshot_status(uuid) to authenticated;

create function public.request_screenshot(p_saas uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_taken timestamptz;
  v_requested timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in to take a screenshot' using errcode = '42501';
  end if;
  select s.screenshot_taken_at, d.requested_at into v_taken, v_requested
  from public.saas s join private.saas_screenshots d on d.saas_id = s.id
  where s.id = p_saas and s.owner_id = v_user
  for update of d;
  if not found then
    raise exception 'You can only take a screenshot of your own SaaS';
  end if;
  if not coalesce((select show_screenshot from public.saas_settings where saas_id = p_saas), true)
  then
    raise exception 'Turn on the screenshot in the product''s settings first';
  end if;
  if greatest(v_taken, v_requested) > now() - interval '10 minutes' then
    raise exception 'A screenshot was taken or asked for in the last ten minutes. Try again later';
  end if;
  update private.saas_screenshots set requested_at = now(), attempts = 0, attempted_at = null,
    last_error = null
  where saas_id = p_saas;
end;
$$;
revoke execute on function public.request_screenshot(uuid) from public, anon, service_role;
grant execute on function public.request_screenshot(uuid) to authenticated;

-- 5. The run claims products that are due, for service_role only: listed, with the screenshot
-- on, and asked for, never taken, or taken over 30 days ago. A failed attempt waits five minutes,
-- then twice as long each time, up to a day. With p_saas, only that product is claimed.
create function public.claim_due_screenshots(p_limit integer, p_saas uuid default null)
returns table(saas_id uuid, owner_id uuid, website text)
language sql security invoker set search_path = '' as $$
  with due as materialized (
    select d.saas_id from private.saas_screenshots d
    join public.saas s on s.id = d.saas_id
    join public.profiles p on p.id = s.owner_id
    left join public.saas_settings t on t.saas_id = s.id
    where s.hidden_at is null and p.suspended_at is null
      and coalesce(t.show_screenshot, true)
      and (p_saas is null or s.id = p_saas)
      and (d.requested_at is not null or s.screenshot_taken_at is null
        or s.screenshot_taken_at < now() - interval '30 days')
      and (d.attempts = 0 or d.attempted_at is null or d.attempted_at < now()
        - least(interval '5 minutes' * power(2, d.attempts - 1), interval '1 day'))
    order by d.requested_at nulls last, s.screenshot_taken_at nulls first, s.id
    limit p_limit
    for update of d skip locked
  )
  update private.saas_screenshots d set attempted_at = now(), attempts = d.attempts + 1
  from due, public.saas s
  where d.saas_id = due.saas_id and s.id = d.saas_id
  returning d.saas_id, s.owner_id, s.website;
$$;
revoke execute on function public.claim_due_screenshots(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_due_screenshots(integer, uuid) to service_role;

-- The result of an attempt, for service_role only: the stored file, or the failure for the
-- founder. A screenshot of a website that has changed since, or that the founder turned off, is
-- not used. Returns the files to delete from storage: the one it replaces, or the new one when
-- it was not used.
create function public.record_screenshot(p_saas uuid, p_website text, p_path text,
  p_error text)
returns text[] language plpgsql security invoker set search_path = '' as $$
declare
  v_website text;
  v_old text;
begin
  select s.website, s.screenshot_path into v_website, v_old
  from public.saas s where s.id = p_saas for update;
  if p_path is null then
    update private.saas_screenshots set last_error = left(coalesce(p_error, 'Unknown error'), 300)
    where saas_id = p_saas;
    return '{}';
  end if;
  if v_website is null or v_website <> p_website
    or not coalesce((select show_screenshot from public.saas_settings where saas_id = p_saas), true)
  then
    return array[p_path];
  end if;
  update public.saas set screenshot_path = p_path, screenshot_taken_at = now() where id = p_saas;
  update private.saas_screenshots set requested_at = null, attempts = 0, last_error = null
  where saas_id = p_saas;
  return case when v_old is null then '{}'::text[] else array[v_old] end;
end;
$$;
revoke execute on function public.record_screenshot(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_screenshot(uuid, text, text, text) to service_role;

-- Files waiting to be deleted from storage, taken off the list as they are returned.
create function public.take_stale_screenshots(p_limit integer)
returns setof text language sql security invoker set search_path = '' as $$
  with taken as (
    select d.path from private.screenshot_deletions d
    order by d.queued_at, d.path
    limit p_limit
    for update skip locked
  )
  delete from private.screenshot_deletions d using taken
  where d.path = taken.path
  returning d.path;
$$;
revoke execute on function public.take_stale_screenshots(integer) from public, anon, authenticated;
grant execute on function public.take_stale_screenshots(integer) to service_role;

-- 6. The maker save takes the screenshot choice as a new, optional last parameter; without it,
-- the saved choice stays.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[]);
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_mrr boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null, p_show_screenshot boolean default null
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
  insert into public.saas_settings(saas_id, owner_id, share_mrr, share_customers, launched_on,
    share_launch, show_screenshot)
  values (saved_id, actor, p_share_mrr, p_share_customers, p_launched_on, p_share_launch,
    coalesce(p_show_screenshot, true))
  on conflict (saas_id) do update set share_mrr = excluded.share_mrr,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch,
    show_screenshot = coalesce(p_show_screenshot, public.saas_settings.show_screenshot),
    updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean) to authenticated;

-- 7. The public projection carries the screenshot. The new columns are appended, so both views
-- are replaced in place.
create or replace view public.public_saas with (security_invoker = true) as
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
  s.slug, p.slug as owner_slug, m.provider, s.tech_stack, s.verified_domain, s.domain_verified_at,
  s.screenshot_path, s.screenshot_taken_at
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

-- 8. Screenshots are taken every five minutes, for the products that are due. A run stops
-- claiming after 90 seconds and may take two minutes.
select cron.schedule('harbor-screenshots', '*/5 * * * *',
  $$ select private.run_scheduled_job('/api/screenshots/capture', 130000) $$);

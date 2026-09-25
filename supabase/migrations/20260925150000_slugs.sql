-- Readable addresses: /saas/<slug> and /makers/<slug>. Slugs come from the name, are unique per
-- kind and are set only by triggers, never by makers. A renamed product keeps its earlier slugs as
-- redirects, so shared links keep working. A renamed maker does not: the slug is made from the
-- person's name, and a new name should not stay reachable through the old one. Ids keep working
-- everywhere and redirect to the slug.

create extension if not exists unaccent with schema extensions;

-- Lowercase ASCII words joined by hyphens, at most 60 characters. The dictionary is named, since
-- the one-argument unaccent() looks it up through the empty search path.
create function private.slugify(p_text text) returns text
language sql stable set search_path = '' as $$
  select trim(both '-' from left(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))),
    '[^a-z0-9]+', '-', 'g'), 60));
$$;
revoke execute on function private.slugify(text) from public, anon, authenticated;

-- Earlier slugs of renamed products. Reached only through saas_slug_redirect().
create table private.saas_slug_redirects (
  slug text primary key,
  saas_id uuid not null references public.saas(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index saas_slug_redirects_saas_idx on private.saas_slug_redirects(saas_id);
alter table private.saas_slug_redirects enable row level security;
revoke all on private.saas_slug_redirects from public, anon, authenticated;

-- The first free slug for a name: the plain slug, then -2, -3 and so on. A product's slug is also
-- taken while it redirects to another product.
create function private.assign_slug(p_kind text, p_id uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_base text := private.slugify(p_name);
  v_slug text;
  v_n integer := 1;
begin
  if v_base = '' then
    v_base := case p_kind when 'saas' then 'product' else 'maker' end || '-' || left(p_id::text, 8);
  end if;
  -- Two saves of the same name wait for each other, so they cannot pick the same slug.
  perform pg_advisory_xact_lock(hashtextextended('slug:' || p_kind || ':' || v_base, 0));
  v_slug := v_base;
  while case p_kind
    when 'saas' then
      exists (select 1 from public.saas s where s.slug = v_slug and s.id <> p_id)
      or exists (select 1 from private.saas_slug_redirects r
        where r.slug = v_slug and r.saas_id <> p_id)
    else exists (select 1 from public.profiles p where p.slug = v_slug and p.id <> p_id)
  end loop
    v_n := v_n + 1;
    v_slug := rtrim(left(v_base, 55), '-') || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;
revoke execute on function private.assign_slug(text, uuid, text) from public, anon, authenticated;

-- Backfill, oldest first, so earlier products and makers keep the plain slug.
alter table public.saas add column slug text;
alter table public.profiles add column slug text;
do $$
declare
  v_row record;
begin
  for v_row in select s.id, s.name from public.saas s order by s.created_at, s.id loop
    update public.saas set slug = private.assign_slug('saas', v_row.id, v_row.name)
    where id = v_row.id;
  end loop;
  for v_row in
    select p.id, p.name from public.profiles p join auth.users u on u.id = p.id
    order by u.created_at, p.id
  loop
    update public.profiles set slug = private.assign_slug('profile', v_row.id, v_row.name)
    where id = v_row.id;
  end loop;
end;
$$;
alter table public.saas
  alter column slug set not null,
  add constraint saas_slug_key unique (slug),
  add constraint saas_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64);
alter table public.profiles
  alter column slug set not null,
  add constraint profiles_slug_key unique (slug),
  add constraint profiles_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64);

-- Slugs follow the name. Makers hold no grant on the column, so only these triggers write it.
create function private.saas_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.slug := private.assign_slug('saas', new.id, new.name);
  elsif private.slugify(new.name) is distinct from private.slugify(old.name) then
    new.slug := private.assign_slug('saas', new.id, new.name);
    if new.slug <> old.slug then
      insert into private.saas_slug_redirects(slug, saas_id) values (old.slug, new.id)
      on conflict (slug) do update set saas_id = excluded.saas_id;
      -- Renamed back: the slug is current again, not a redirect.
      delete from private.saas_slug_redirects where slug = new.slug;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.saas_slug() from public, anon, authenticated;
create trigger saas_slug before insert or update of name on public.saas
  for each row execute function private.saas_slug();

create function private.profile_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or private.slugify(new.name) is distinct from private.slugify(old.name) then
    new.slug := private.assign_slug('profile', new.id, new.name);
  end if;
  return new;
end;
$$;
revoke execute on function private.profile_slug() from public, anon, authenticated;
create trigger profile_slug before insert or update of name on public.profiles
  for each row execute function private.profile_slug();

-- The current slug of a product that used to have this slug, if it is listed.
create function public.saas_slug_redirect(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select s.slug
  from private.saas_slug_redirects r
  join public.saas s on s.id = r.saas_id
  join public.profiles p on p.id = s.owner_id
  where r.slug = lower(p_slug) and s.hidden_at is null and p.suspended_at is null;
$$;
revoke execute on function public.saas_slug_redirect(text) from public;
grant execute on function public.saas_slug_redirect(text) to anon, authenticated;

-- The public views gain the product's and the maker's slug, appended so they are replaced in place.
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
  s.slug,
  p.slug as owner_slug
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

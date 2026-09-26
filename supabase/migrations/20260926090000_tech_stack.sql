-- Founders name the technologies a product is built with. The catalog lives in src/lib/tech.ts;
-- the database stores its slugs and checks their form, count and uniqueness. Every technology has
-- a page listing the products that use it, like the categories.

-- 1. The stack: at most 20 unique slugs such as "nextjs" or "ruby-on-rails".
create function private.valid_tech_stack(p_stack text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(p_stack) <= 20
    and not exists (
      select 1 from unnest(p_stack) as slug
      where slug is null or char_length(slug) > 40 or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
    and cardinality(p_stack) = (select count(distinct slug) from unnest(p_stack) as slug);
$$;
-- A check constraint runs with the rights of whoever writes the row: makers and the server.
revoke execute on function private.valid_tech_stack(text[]) from public, anon;
grant execute on function private.valid_tech_stack(text[]) to authenticated, service_role;

alter table public.saas
  add column tech_stack text[] not null default '{}'
    constraint saas_tech_stack_check check (private.valid_tech_stack(tech_stack));
create index saas_tech_stack_idx on public.saas using gin (tech_stack);

-- Makers write the stack like the other fields they edit.
grant insert (tech_stack), update (tech_stack) on public.saas to authenticated;

-- 2. The public projection shows the stack. The new column is appended, so both views are
-- replaced in place; the leaderboard is replaced so that its s.* includes it.
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
  s.slug, p.slug as owner_slug, m.provider, s.tech_stack
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

-- 3. Listed and ranked products per technology, for the technology pages, the sitemap and
-- llms.txt. Like category_counts it reads public_saas with the caller's rights, so hidden
-- products and suspended makers never count, and a technology without products has no row.
create view public.tech_counts with (security_invoker = true) as
select t.tech,
  count(*)::integer as products,
  (count(*) filter (where s.revenue_status = 'verified'))::integer as ranked
from public.public_saas s
cross join lateral unnest(s.tech_stack) as t(tech)
group by t.tech;
grant select on public.tech_counts to anon, authenticated;

-- 4. The maker save takes the stack. It is the last parameter and optional, so a caller that
-- does not send it, such as the code that was live when this ran, keeps the saved stack.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean);
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

-- Public identity data is separate from owner-only metric history.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  bio text not null default '' check (char_length(bio) <= 400),
  website text not null default '' check (website = '' or website ~ '^https?://'),
  social_url text not null default '' check (social_url = '' or social_url ~ '^https?://'),
  avatar_path text check (avatar_path is null or avatar_path like id::text || '/%'),
  updated_at timestamptz not null default now()
);
create table public.saas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  tagline text not null check (char_length(tagline) between 5 and 140),
  description text not null check (char_length(description) between 20 and 5000),
  category text not null check (category in ('AI & Machine Learning','Developer Tools','Productivity','Marketing','Design','Finance','Analytics','Other')),
  website text not null check (website ~ '^https?://' and char_length(website) <= 500),
  logo_path text check (logo_path is null or logo_path like owner_id::text || '/%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index saas_owner_idx on public.saas(owner_id);
create index saas_newest_idx on public.saas(created_at desc, id);
create index saas_category_newest_idx on public.saas(category, created_at desc, id);

create table public.metric_reports (
  id uuid primary key default gen_random_uuid(),
  saas_id uuid not null,
  owner_id uuid not null,
  mrr_cents bigint check (mrr_cents between 0 and 999999999999),
  customers integer check (customers between 0 and 999999999),
  launched_on date,
  public_mrr boolean not null default false,
  public_customers boolean not null default false,
  public_launch boolean not null default false,
  reported_at timestamptz not null default now(),
  foreign key (saas_id, owner_id) references public.saas(id, owner_id) on delete cascade
);
create index metric_reports_owner_idx on public.metric_reports(owner_id);
create index metric_reports_latest_idx on public.metric_reports(saas_id, reported_at desc, id);

create table public.public_metrics (
  saas_id uuid primary key,
  owner_id uuid not null,
  mrr_cents bigint check (mrr_cents between 0 and 999999999999),
  customers integer check (customers between 0 and 999999999),
  launched_on date,
  reported_at timestamptz not null default now(),
  foreign key (saas_id, owner_id) references public.saas(id, owner_id) on delete cascade
);
create index public_metrics_owner_idx on public.public_metrics(owner_id);
create index public_metrics_ranking_idx on public.public_metrics(mrr_cents desc, saas_id) where mrr_cents is not null;

alter table public.profiles enable row level security;
alter table public.saas enable row level security;
alter table public.metric_reports enable row level security;
alter table public.public_metrics enable row level security;

revoke all on public.profiles, public.saas, public.metric_reports, public.public_metrics from anon, authenticated;
grant select on public.profiles, public.saas, public.public_metrics to anon, authenticated;
grant insert, update on public.profiles, public.saas, public.public_metrics to authenticated;
grant select, insert on public.metric_reports to authenticated;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_owner_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_owner_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy saas_public_read on public.saas for select to anon, authenticated using (true);
create policy saas_owner_insert on public.saas for insert to authenticated with check (owner_id = (select auth.uid()));
create policy saas_owner_update on public.saas for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy reports_owner_read on public.metric_reports for select to authenticated using (owner_id = (select auth.uid()));
create policy reports_owner_insert on public.metric_reports for insert to authenticated with check (owner_id = (select auth.uid()));
create policy metrics_public_read on public.public_metrics for select to anon, authenticated using (true);
create policy metrics_owner_insert on public.public_metrics for insert to authenticated with check (owner_id = (select auth.uid()));
create policy metrics_owner_update on public.public_metrics for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create view public.public_saas with (security_invoker = true) as
select s.id, s.owner_id, s.name, s.tagline, s.description, s.category, s.website, s.logo_path,
  s.created_at, s.updated_at, p.name as owner_name, p.avatar_path as owner_avatar_path,
  m.mrr_cents, m.customers, m.launched_on, m.reported_at
from public.saas s join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where mrr_cents is not null;
grant select on public.public_saas, public.leaderboard to anon, authenticated;

-- Invoker permissions and RLS remain active throughout the atomic save.
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_mrr_cents bigint, p_customers integer, p_launched_on date,
  p_public_mrr boolean, p_public_customers boolean, p_public_launch boolean
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profiles(id, name) values (actor, 'Harbor maker') on conflict (id) do nothing;
  insert into public.saas(id, owner_id, name, tagline, description, category, website, logo_path)
  values (p_id, actor, p_name, p_tagline, p_description, p_category, p_website, p_logo_path)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline,
    description = excluded.description, category = excluded.category, website = excluded.website,
    logo_path = excluded.logo_path, updated_at = now()
  where public.saas.owner_id = actor returning id into saved_id;
  if saved_id is null then raise exception 'Not the owner' using errcode = '42501'; end if;
  insert into public.metric_reports(saas_id, owner_id, mrr_cents, customers, launched_on, public_mrr, public_customers, public_launch)
  values (saved_id, actor, p_mrr_cents, p_customers, p_launched_on, p_public_mrr, p_public_customers, p_public_launch);
  insert into public.public_metrics(saas_id, owner_id, mrr_cents, customers, launched_on)
  values (saved_id, actor, case when p_public_mrr then p_mrr_cents end,
    case when p_public_customers then p_customers end, case when p_public_launch then p_launched_on end)
  on conflict (saas_id) do update set mrr_cents = excluded.mrr_cents, customers = excluded.customers,
    launched_on = excluded.launched_on, reported_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,bigint,integer,date,boolean,boolean,boolean) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,bigint,integer,date,boolean,boolean,boolean) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 2097152, array['image/png','image/jpeg','image/webp']);
create policy images_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy images_owner_read on storage.objects for select to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy images_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

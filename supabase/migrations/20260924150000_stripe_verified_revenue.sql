-- Revenue is verified through a read-only Stripe connection instead of being entered by makers.
-- Only trusted server code (service_role) writes verified figures. Makers control visibility
-- and launch date. A trigger keeps the public projection consistent with both.

-- Schema for internals that must never be reachable through the Data API.
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- 1. Maker-controlled settings, readable only by the owner.
create table public.saas_settings (
  saas_id uuid primary key,
  owner_id uuid not null,
  share_mrr boolean not null default false,
  share_customers boolean not null default false,
  launched_on date check (launched_on between date '0001-01-01' and date '9999-12-31'),
  share_launch boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key (saas_id, owner_id) references public.saas(id, owner_id) on delete cascade
);
create index saas_settings_owner_idx on public.saas_settings(owner_id);

-- Carry over visibility choices and launch dates from the latest self-reported report.
insert into public.saas_settings(saas_id, owner_id, share_mrr, share_customers, launched_on, share_launch)
select distinct on (saas_id) saas_id, owner_id, public_mrr, public_customers, launched_on, public_launch
from public.metric_reports
order by saas_id, reported_at desc, id;

-- 2. Self-reported figures are removed.
drop view public.leaderboard;
drop view public.public_saas;
drop function public.save_saas(uuid,text,text,text,text,text,text,bigint,integer,date,boolean,boolean,boolean);
drop table public.public_metrics;
drop table public.metric_reports;

-- 3. Stripe connections. The encrypted key is never granted to API roles.
create table public.stripe_connections (
  saas_id uuid primary key,
  owner_id uuid not null,
  encrypted_key text not null check (encrypted_key like 'v1:%' and char_length(encrypted_key) <= 2048),
  key_hint text not null check (char_length(key_hint) <= 40),
  livemode boolean not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text check (char_length(last_error) <= 500),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  foreign key (saas_id, owner_id) references public.saas(id, owner_id) on delete cascade
);
create index stripe_connections_owner_idx on public.stripe_connections(owner_id);

-- Each Stripe subscription can verify one SaaS only, so one account cannot be counted twice.
create table private.stripe_subscription_claims (
  subscription_hash text primary key check (char_length(subscription_hash) = 64),
  saas_id uuid not null references public.stripe_connections(saas_id) on delete cascade
);
create index stripe_subscription_claims_saas_idx on private.stripe_subscription_claims(saas_id);

-- 4. Verified history, private to the owner.
create table public.revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  saas_id uuid not null,
  owner_id uuid not null,
  mrr_cents bigint not null check (mrr_cents between 0 and 999999999999),
  customers integer not null check (customers between 0 and 999999999),
  livemode boolean not null,
  currencies jsonb not null default '{}'::jsonb,
  fx_date date,
  captured_at timestamptz not null default clock_timestamp(),
  -- Insertion order breaks ties between snapshots taken at the same instant.
  seq bigint generated always as identity,
  foreign key (saas_id, owner_id) references public.saas(id, owner_id) on delete cascade
);
create index revenue_snapshots_latest_idx on public.revenue_snapshots(saas_id, captured_at desc, seq desc);
create index revenue_snapshots_owner_idx on public.revenue_snapshots(owner_id);

-- 5. Public projection, one row per SaaS, written only by the refresh function below.
create table public.public_metrics (
  saas_id uuid primary key,
  owner_id uuid not null,
  mrr_cents bigint check (mrr_cents between 0 and 999999999999),
  customers integer check (customers between 0 and 999999999),
  livemode boolean,
  verified_at timestamptz,
  launched_on date,
  foreign key (saas_id, owner_id) references public.saas(id, owner_id) on delete cascade
);
create index public_metrics_owner_idx on public.public_metrics(owner_id);
create index public_metrics_ranking_idx on public.public_metrics(mrr_cents desc, saas_id)
  where mrr_cents is not null;

-- Grants and row-level security.
alter table public.saas_settings enable row level security;
alter table public.stripe_connections enable row level security;
alter table private.stripe_subscription_claims enable row level security;
alter table public.revenue_snapshots enable row level security;
alter table public.public_metrics enable row level security;

revoke all on public.saas_settings, public.stripe_connections, public.revenue_snapshots,
  public.public_metrics from anon, authenticated;
revoke all on private.stripe_subscription_claims from public, anon, authenticated;
grant all on public.saas_settings, public.stripe_connections, public.revenue_snapshots,
  public.public_metrics, private.stripe_subscription_claims to service_role;

grant select, insert, update on public.saas_settings to authenticated;
create policy settings_owner_read on public.saas_settings for select to authenticated
  using (owner_id = (select auth.uid()));
create policy settings_owner_insert on public.saas_settings for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy settings_owner_update on public.saas_settings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Owners see their connection status, never the key.
grant select (saas_id, owner_id, key_hint, livemode, status, last_error, connected_at, last_synced_at)
  on public.stripe_connections to authenticated;
create policy connections_owner_read on public.stripe_connections for select to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.revenue_snapshots to authenticated;
create policy snapshots_owner_read on public.revenue_snapshots for select to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.public_metrics to anon, authenticated;
create policy metrics_public_read on public.public_metrics for select to anon, authenticated
  using (true);

-- 6. Public projection refresh. SECURITY DEFINER so triggers fired by makers can write the
-- projection, which makers themselves cannot. It lives in the unexposed private schema.
create function private.refresh_public_metrics(p_saas_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_settings public.saas_settings%rowtype;
  v_snapshot public.revenue_snapshots%rowtype;
  v_connected boolean;
begin
  select owner_id into v_owner from public.saas where id = p_saas_id;
  if v_owner is null then return; end if;
  select * into v_settings from public.saas_settings where saas_id = p_saas_id;
  select exists(select 1 from public.stripe_connections where saas_id = p_saas_id) into v_connected;
  if v_connected then
    select * into v_snapshot from public.revenue_snapshots
    where saas_id = p_saas_id order by captured_at desc, seq desc limit 1;
  end if;
  insert into public.public_metrics(saas_id, owner_id, mrr_cents, customers, livemode, verified_at, launched_on)
  values (
    p_saas_id, v_owner,
    case when v_settings.share_mrr then v_snapshot.mrr_cents end,
    case when v_settings.share_customers then v_snapshot.customers end,
    v_snapshot.livemode,
    v_snapshot.captured_at,
    case when v_settings.share_launch then v_settings.launched_on end
  )
  on conflict (saas_id) do update set mrr_cents = excluded.mrr_cents,
    customers = excluded.customers, livemode = excluded.livemode,
    verified_at = excluded.verified_at, launched_on = excluded.launched_on;
end;
$$;
revoke execute on function private.refresh_public_metrics(uuid) from public, anon, authenticated;

create function private.refresh_public_metrics_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_public_metrics(case when tg_op = 'DELETE' then old.saas_id else new.saas_id end);
  return null;
end;
$$;
revoke execute on function private.refresh_public_metrics_trigger() from public, anon, authenticated;

create trigger saas_settings_refresh after insert or update on public.saas_settings
  for each row execute function private.refresh_public_metrics_trigger();
create trigger revenue_snapshots_refresh after insert on public.revenue_snapshots
  for each row execute function private.refresh_public_metrics_trigger();
create trigger stripe_connections_refresh after delete on public.stripe_connections
  for each row execute function private.refresh_public_metrics_trigger();

-- Backfill: every existing SaaS gets its projection (launch dates only; nothing is verified yet).
select private.refresh_public_metrics(id) from public.saas;

-- 7. Public views. Figures older than seven days are treated as stale and hidden, so a revoked
-- key cannot keep an old number on the leaderboard.
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
  end as revenue_status
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';
grant select on public.public_saas, public.leaderboard to anon, authenticated;

-- 8. Maker save: product details, visibility and launch date. Figures are not accepted.
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_mrr boolean, p_share_customers boolean,
  p_share_launch boolean
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
  insert into public.saas_settings(saas_id, owner_id, share_mrr, share_customers, launched_on, share_launch)
  values (saved_id, actor, p_share_mrr, p_share_customers, p_launched_on, p_share_launch)
  on conflict (saas_id) do update set share_mrr = excluded.share_mrr,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch, updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean) to authenticated;

-- 9. Trusted verification write, for service_role only. Optionally stores a new encrypted key,
-- claims the counted subscriptions, and records the snapshot in one transaction.
create function public.record_stripe_verification(
  p_saas_id uuid, p_encrypted_key text, p_key_hint text, p_livemode boolean,
  p_mrr_cents bigint, p_customers integer, p_currencies jsonb, p_fx_date date,
  p_subscription_hashes text[]
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.saas where id = p_saas_id;
  if v_owner is null then raise exception 'Unknown SaaS' using errcode = 'P0002'; end if;
  if p_encrypted_key is not null then
    insert into public.stripe_connections(saas_id, owner_id, encrypted_key, key_hint, livemode)
    values (p_saas_id, v_owner, p_encrypted_key, p_key_hint, p_livemode)
    on conflict (saas_id) do update set encrypted_key = excluded.encrypted_key,
      key_hint = excluded.key_hint, livemode = excluded.livemode, connected_at = now();
  elsif not exists(select 1 from public.stripe_connections where saas_id = p_saas_id) then
    raise exception 'Stripe is not connected' using errcode = 'P0002';
  end if;
  if exists(
    select 1 from private.stripe_subscription_claims
    where subscription_hash = any(p_subscription_hashes) and saas_id <> p_saas_id
  ) then
    raise exception 'These Stripe subscriptions already verify another SaaS' using errcode = '23505';
  end if;
  delete from private.stripe_subscription_claims where saas_id = p_saas_id;
  insert into private.stripe_subscription_claims(subscription_hash, saas_id)
  select distinct hash, p_saas_id from unnest(p_subscription_hashes) as hash;
  insert into public.revenue_snapshots(saas_id, owner_id, mrr_cents, customers, livemode, currencies, fx_date)
  values (p_saas_id, v_owner, p_mrr_cents, p_customers, p_livemode, p_currencies, p_fx_date);
  update public.stripe_connections set status = 'ok', last_error = null, last_synced_at = now(),
    livemode = p_livemode
  where saas_id = p_saas_id;
end;
$$;
revoke execute on function public.record_stripe_verification(uuid,text,text,boolean,bigint,integer,jsonb,date,text[]) from public, anon, authenticated;
grant execute on function public.record_stripe_verification(uuid,text,text,boolean,bigint,integer,jsonb,date,text[]) to service_role;

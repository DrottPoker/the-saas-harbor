-- Revenue can be verified through Paddle, Polar and Dodo Payments as well as Stripe, still with one
-- connection per product. The Stripe names become provider-neutral, and connections, snapshots and
-- the public projection record which provider verified the figures.

-- 1. Connections, subscription claims and checks.
alter table public.stripe_connections rename to revenue_connections;
alter table public.revenue_connections
  add column provider text not null default 'stripe'
    constraint revenue_connections_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo'));
alter table public.revenue_connections alter column provider drop default;
alter table public.revenue_connections
  rename constraint stripe_connections_pkey to revenue_connections_pkey;
alter table public.revenue_connections
  rename constraint stripe_connections_encrypted_key_check to revenue_connections_encrypted_key_check;
alter table public.revenue_connections
  rename constraint stripe_connections_key_hint_check to revenue_connections_key_hint_check;
alter table public.revenue_connections
  rename constraint stripe_connections_status_check to revenue_connections_status_check;
alter table public.revenue_connections
  rename constraint stripe_connections_last_error_check to revenue_connections_last_error_check;
alter table public.revenue_connections
  rename constraint stripe_connections_saas_id_owner_id_fkey to revenue_connections_saas_id_owner_id_fkey;
alter index public.stripe_connections_owner_idx rename to revenue_connections_owner_idx;
alter trigger stripe_connections_refresh on public.revenue_connections
  rename to revenue_connections_refresh;
-- Owners read which provider a connection uses, and still never the key.
grant select (provider) on public.revenue_connections to authenticated;

-- A claim is the SHA-256 of a subscription id; ids from other providers than Stripe are prefixed
-- with the provider's name, so equal ids from two providers never collide.
alter table private.stripe_subscription_claims rename to subscription_claims;
alter table private.subscription_claims
  rename constraint stripe_subscription_claims_pkey to subscription_claims_pkey;
alter table private.subscription_claims
  rename constraint stripe_subscription_claims_subscription_hash_check to subscription_claims_subscription_hash_check;
alter table private.subscription_claims
  rename constraint stripe_subscription_claims_saas_id_fkey to subscription_claims_saas_id_fkey;
alter index private.stripe_subscription_claims_saas_idx rename to subscription_claims_saas_idx;

alter table private.stripe_checks rename to revenue_checks;
alter table private.revenue_checks
  rename constraint stripe_checks_owner_id_fkey to revenue_checks_owner_id_fkey;
alter index private.stripe_checks_owner_idx rename to revenue_checks_owner_idx;

-- 2. Snapshots and the public projection name the provider.
alter table public.revenue_snapshots
  add column provider text constraint revenue_snapshots_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo'));
update public.revenue_snapshots set provider = 'stripe';
alter table public.revenue_snapshots alter column provider set not null;
alter table public.public_metrics add column provider text;

create or replace function private.refresh_public_metrics(p_saas_id uuid) returns void
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
  select exists(select 1 from public.revenue_connections where saas_id = p_saas_id) into v_connected;
  if v_connected then
    select * into v_snapshot from public.revenue_snapshots
    where saas_id = p_saas_id order by captured_at desc, seq desc limit 1;
  end if;
  insert into public.public_metrics(saas_id, owner_id, mrr_cents, customers, livemode, verified_at,
    launched_on, mrr_history, mrr_growth_pct, provider)
  values (
    p_saas_id, v_owner,
    case when v_settings.share_mrr then v_snapshot.mrr_cents end,
    case when v_settings.share_customers then v_snapshot.customers end,
    v_snapshot.livemode,
    v_snapshot.captured_at,
    case when v_settings.share_launch then v_settings.launched_on end,
    -- History and growth reveal MRR, so they follow the MRR sharing choice.
    case when v_settings.share_mrr then v_snapshot.history end,
    case when v_settings.share_mrr and v_snapshot.mrr_30d_ago_cents > 0 then
      round((v_snapshot.mrr_invoice_cents - v_snapshot.mrr_30d_ago_cents) * 100.0
        / v_snapshot.mrr_30d_ago_cents, 1)
    end,
    v_snapshot.provider
  )
  on conflict (saas_id) do update set mrr_cents = excluded.mrr_cents,
    customers = excluded.customers, livemode = excluded.livemode,
    verified_at = excluded.verified_at, launched_on = excluded.launched_on,
    mrr_history = excluded.mrr_history, mrr_growth_pct = excluded.mrr_growth_pct,
    provider = excluded.provider;
end;
$$;

-- The new column is appended, so both views can be replaced in place.
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
  s.slug, p.slug as owner_slug, m.provider
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

-- 3. Checks a maker starts: the same limits as before, for every provider.
drop function public.begin_stripe_check(uuid, boolean);
create function public.begin_revenue_check(p_saas uuid, p_refresh boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to verify revenue' using errcode = '42501';
  end if;
  if not exists (select 1 from public.saas s where s.id = p_saas and s.owner_id = v_user) then
    raise exception 'You can only verify revenue for your own SaaS';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('revenue_check:' || v_user::text, 0));
  if p_refresh and exists (
    select 1 from public.revenue_connections c
    where c.saas_id = p_saas
      and greatest(c.last_synced_at, c.last_checked_at) > now() - interval '5 minutes'
  ) then
    raise exception 'Revenue was checked in the last few minutes. Try again later';
  end if;
  delete from private.revenue_checks k
  where k.owner_id = v_user and k.checked_at <= now() - interval '1 hour';
  if (select count(*) from private.revenue_checks k where k.owner_id = v_user) >= 20 then
    raise exception 'Revenue was checked many times in the last hour. Try again later';
  end if;
  insert into private.revenue_checks(owner_id) values (v_user);
  update public.revenue_connections set last_checked_at = now() where saas_id = p_saas;
end;
$$;
revoke execute on function public.begin_revenue_check(uuid, boolean) from public, anon, service_role;
grant execute on function public.begin_revenue_check(uuid, boolean) to authenticated;

-- 4. The trusted verification write, now for any provider. A new key may switch the provider; a
-- re-verification must come from the provider the product is connected to.
drop function public.record_stripe_verification(uuid,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint);
create function public.record_revenue_verification(
  p_saas_id uuid, p_provider text, p_encrypted_key text, p_key_hint text, p_livemode boolean,
  p_mrr_cents bigint, p_customers integer, p_currencies jsonb, p_fx_date date,
  p_subscription_hashes text[], p_history jsonb, p_mrr_invoice_cents bigint,
  p_mrr_30d_ago_cents bigint
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.saas where id = p_saas_id;
  if v_owner is null then raise exception 'Unknown SaaS' using errcode = 'P0002'; end if;
  if p_encrypted_key is not null then
    insert into public.revenue_connections(saas_id, owner_id, provider, encrypted_key, key_hint,
      livemode)
    values (p_saas_id, v_owner, p_provider, p_encrypted_key, p_key_hint, p_livemode)
    on conflict (saas_id) do update set provider = excluded.provider,
      encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint,
      livemode = excluded.livemode, connected_at = now();
  elsif not exists(
    select 1 from public.revenue_connections where saas_id = p_saas_id and provider = p_provider
  ) then
    raise exception 'The product is not connected to this provider' using errcode = 'P0002';
  end if;
  if exists(
    select 1 from private.subscription_claims
    where subscription_hash = any(p_subscription_hashes) and saas_id <> p_saas_id
  ) then
    raise exception 'These subscriptions already verify another SaaS' using errcode = '23505';
  end if;
  delete from private.subscription_claims where saas_id = p_saas_id;
  insert into private.subscription_claims(subscription_hash, saas_id)
  select distinct hash, p_saas_id from unnest(p_subscription_hashes) as hash;
  insert into public.revenue_snapshots(saas_id, owner_id, provider, mrr_cents, customers, livemode,
    currencies, fx_date, history, mrr_invoice_cents, mrr_30d_ago_cents)
  values (p_saas_id, v_owner, p_provider, p_mrr_cents, p_customers, p_livemode, p_currencies,
    p_fx_date, p_history, p_mrr_invoice_cents, p_mrr_30d_ago_cents);
  update public.revenue_connections set status = 'ok', last_error = null, last_synced_at = now(),
    livemode = p_livemode
  where saas_id = p_saas_id;
end;
$$;
revoke execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint) from public, anon, authenticated;
grant execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint) to service_role;

-- 5. Every projection gets its provider.
select private.refresh_public_metrics(id) from public.saas;

-- MRR history for charts: twelve month-end values reconstructed from paid Stripe invoices, and
-- the invoice-based MRR now and 30 days ago for growth. Public only when the maker shares MRR.

alter table public.revenue_snapshots
  add column history jsonb check (history is null or jsonb_typeof(history) = 'array'),
  add column mrr_invoice_cents bigint check (mrr_invoice_cents between 0 and 999999999999),
  add column mrr_30d_ago_cents bigint check (mrr_30d_ago_cents between 0 and 999999999999);

alter table public.public_metrics
  add column mrr_history jsonb,
  add column mrr_growth_pct numeric;

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
  select exists(select 1 from public.stripe_connections where saas_id = p_saas_id) into v_connected;
  if v_connected then
    select * into v_snapshot from public.revenue_snapshots
    where saas_id = p_saas_id order by captured_at desc, seq desc limit 1;
  end if;
  insert into public.public_metrics(saas_id, owner_id, mrr_cents, customers, livemode, verified_at,
    launched_on, mrr_history, mrr_growth_pct)
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
    end
  )
  on conflict (saas_id) do update set mrr_cents = excluded.mrr_cents,
    customers = excluded.customers, livemode = excluded.livemode,
    verified_at = excluded.verified_at, launched_on = excluded.launched_on,
    mrr_history = excluded.mrr_history, mrr_growth_pct = excluded.mrr_growth_pct;
end;
$$;

-- New columns are appended, so the views can be replaced in place.
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
  case when m.verified_at > now() - interval '7 days' then m.mrr_growth_pct end as mrr_growth_pct
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

-- The verification write gains the history fields.
drop function public.record_stripe_verification(uuid,text,text,boolean,bigint,integer,jsonb,date,text[]);
create function public.record_stripe_verification(
  p_saas_id uuid, p_encrypted_key text, p_key_hint text, p_livemode boolean,
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
  insert into public.revenue_snapshots(saas_id, owner_id, mrr_cents, customers, livemode, currencies,
    fx_date, history, mrr_invoice_cents, mrr_30d_ago_cents)
  values (p_saas_id, v_owner, p_mrr_cents, p_customers, p_livemode, p_currencies, p_fx_date,
    p_history, p_mrr_invoice_cents, p_mrr_30d_ago_cents);
  update public.stripe_connections set status = 'ok', last_error = null, last_synced_at = now(),
    livemode = p_livemode
  where saas_id = p_saas_id;
end;
$$;
revoke execute on function public.record_stripe_verification(uuid,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint) from public, anon, authenticated;
grant execute on function public.record_stripe_verification(uuid,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint) to service_role;

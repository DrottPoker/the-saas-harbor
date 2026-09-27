-- Revenue besides MRR: what customers paid in the last 30 days, the last 12 months and all time,
-- one-time purchases included. Each paid payment is stored with what it earned and the day it
-- was paid, never who paid, so later reads only value payments that are new or changed, and one
-- payment verifies one product only. Founders choose whether the figures are public, as for MRR.

-- 1. The sharing choice, off until the founder turns it on.
alter table public.saas_settings add column share_revenue boolean not null default false;

-- 2. How far reading payments has come, per connection: payments are stored completely from
-- revenue_from, or from the account's first payment once revenue_origin is set, up to
-- revenue_read_at. revenue_checked_at is the last attempt. A new key starts over.
alter table public.revenue_connections
  add column revenue_from date,
  add column revenue_origin boolean not null default false,
  add column revenue_read_at timestamptz,
  add column revenue_checked_at timestamptz,
  add column revenue_note text check (char_length(revenue_note) <= 500);
grant select (revenue_from, revenue_origin, revenue_read_at, revenue_checked_at, revenue_note)
  on public.revenue_connections to authenticated;

-- 3. The payments: the SHA-256 of the payment id (prefixed with the provider's name), the UTC
-- day it was paid, and what it earned in minor units, after discounts and refunds and before tax.
-- The fingerprint changes whenever that amount could have, such as after a refund.
create table private.revenue_payments (
  payment_hash text primary key check (char_length(payment_hash) = 64),
  saas_id uuid not null references public.revenue_connections(saas_id) on delete cascade,
  day date not null,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  amount bigint not null check (amount between 0 and 999999999999),
  fingerprint text not null check (char_length(fingerprint) <= 200)
);
create index revenue_payments_saas_day_idx on private.revenue_payments(saas_id, day);
alter table private.revenue_payments enable row level security;
revoke all on private.revenue_payments from public, anon, authenticated;
grant all on private.revenue_payments to service_role;

-- 4. Snapshots and the public projection carry the figures in USD cents. revenue_at is when the
-- payments behind them were read, which later verifications carry over.
alter table public.revenue_snapshots
  add column revenue_30d_cents bigint check (revenue_30d_cents between 0 and 999999999999),
  add column revenue_12m_cents bigint check (revenue_12m_cents between 0 and 999999999999),
  add column revenue_total_cents bigint check (revenue_total_cents between 0 and 999999999999),
  add column revenue_at timestamptz;
alter table public.public_metrics
  add column revenue_30d_cents bigint,
  add column revenue_12m_cents bigint,
  add column revenue_total_cents bigint;

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
    launched_on, mrr_history, mrr_growth_pct, provider, revenue_30d_cents, revenue_12m_cents,
    revenue_total_cents)
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
    v_snapshot.provider,
    case when v_settings.share_revenue then v_snapshot.revenue_30d_cents end,
    case when v_settings.share_revenue then v_snapshot.revenue_12m_cents end,
    case when v_settings.share_revenue then v_snapshot.revenue_total_cents end
  )
  on conflict (saas_id) do update set mrr_cents = excluded.mrr_cents,
    customers = excluded.customers, livemode = excluded.livemode,
    verified_at = excluded.verified_at, launched_on = excluded.launched_on,
    mrr_history = excluded.mrr_history, mrr_growth_pct = excluded.mrr_growth_pct,
    provider = excluded.provider, revenue_30d_cents = excluded.revenue_30d_cents,
    revenue_12m_cents = excluded.revenue_12m_cents,
    revenue_total_cents = excluded.revenue_total_cents;
end;
$$;

-- 5. The public views gain the figures, hidden like MRR once the verification is a week old. The
-- columns are appended, so the views are replaced in place.
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
  case when m.verified_at > now() - interval '7 days' then m.revenue_30d_cents end
    as revenue_30d_cents,
  case when m.verified_at > now() - interval '7 days' then m.revenue_12m_cents end
    as revenue_12m_cents,
  case when m.verified_at > now() - interval '7 days' then m.revenue_total_cents end
    as revenue_total_cents
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

-- 6. The revenue rankings: a product has a place in each window whose figure it shares, whether or
-- not it shares MRR. Nulls sort last, so the ranks of the products with a figure run from 1.
create view public.revenue_leaderboard with (security_invoker = true) as
select
  case when s.revenue_30d_cents is not null then row_number() over (
    order by s.revenue_30d_cents desc nulls last, s.created_at asc, s.id asc) end as rank_30d,
  case when s.revenue_12m_cents is not null then row_number() over (
    order by s.revenue_12m_cents desc nulls last, s.created_at asc, s.id asc) end as rank_12m,
  case when s.revenue_total_cents is not null then row_number() over (
    order by s.revenue_total_cents desc nulls last, s.created_at asc, s.id asc) end as rank_total,
  s.*
from public.public_saas s
where s.revenue_30d_cents is not null or s.revenue_12m_cents is not null
  or s.revenue_total_cents is not null;
grant select on public.revenue_leaderboard to anon, authenticated;

-- 7. The founder's save takes the revenue sharing choice as its last, optional parameter; left
-- out, the stored choice stays.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[]);
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_mrr boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null, p_share_revenue boolean default null
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
    share_launch, share_revenue)
  values (saved_id, actor, p_share_mrr, p_share_customers, p_launched_on, p_share_launch,
    coalesce(p_share_revenue, false))
  on conflict (saas_id) do update set share_mrr = excluded.share_mrr,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch,
    share_revenue = coalesce(p_share_revenue, public.saas_settings.share_revenue),
    updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean) to authenticated;

-- 8. The verification write stores the revenue figures with the snapshot. A new key may belong to
-- another account, so it starts the payments over.
drop function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz);
create function public.record_revenue_verification(
  p_saas_id uuid, p_provider text, p_encrypted_key text, p_key_hint text, p_livemode boolean,
  p_mrr_cents bigint, p_customers integer, p_currencies jsonb, p_fx_date date,
  p_subscription_hashes text[], p_history jsonb, p_mrr_invoice_cents bigint,
  p_mrr_30d_ago_cents bigint, p_history_at timestamptz default null,
  p_revenue_30d_cents bigint default null, p_revenue_12m_cents bigint default null,
  p_revenue_total_cents bigint default null, p_revenue_at timestamptz default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
  v_today uuid;
begin
  select owner_id into v_owner from public.saas where id = p_saas_id;
  if v_owner is null then raise exception 'Unknown SaaS' using errcode = 'P0002'; end if;
  if p_encrypted_key is not null then
    insert into public.revenue_connections(saas_id, owner_id, provider, encrypted_key, key_hint,
      livemode)
    values (p_saas_id, v_owner, p_provider, p_encrypted_key, p_key_hint, p_livemode)
    on conflict (saas_id) do update set provider = excluded.provider,
      encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint,
      livemode = excluded.livemode, connected_at = now(), revenue_from = null,
      revenue_origin = false, revenue_read_at = null, revenue_checked_at = null,
      revenue_note = null;
    delete from private.revenue_payments where saas_id = p_saas_id;
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
  if p_encrypted_key is null then
    select s.id into v_today from public.revenue_snapshots s
    where s.saas_id = p_saas_id and s.provider = p_provider
      and s.captured_at >= date_trunc('day', now(), 'UTC')
    order by s.captured_at desc, s.seq desc limit 1;
  end if;
  if v_today is not null then
    update public.revenue_snapshots set mrr_cents = p_mrr_cents, customers = p_customers,
      livemode = p_livemode, currencies = p_currencies, fx_date = p_fx_date, history = p_history,
      mrr_invoice_cents = p_mrr_invoice_cents, mrr_30d_ago_cents = p_mrr_30d_ago_cents,
      history_at = p_history_at, revenue_30d_cents = p_revenue_30d_cents,
      revenue_12m_cents = p_revenue_12m_cents, revenue_total_cents = p_revenue_total_cents,
      revenue_at = p_revenue_at, captured_at = clock_timestamp()
    where id = v_today;
  else
    insert into public.revenue_snapshots(saas_id, owner_id, provider, mrr_cents, customers,
      livemode, currencies, fx_date, history, mrr_invoice_cents, mrr_30d_ago_cents, history_at,
      revenue_30d_cents, revenue_12m_cents, revenue_total_cents, revenue_at)
    values (p_saas_id, v_owner, p_provider, p_mrr_cents, p_customers, p_livemode, p_currencies,
      p_fx_date, p_history, p_mrr_invoice_cents, p_mrr_30d_ago_cents, p_history_at,
      p_revenue_30d_cents, p_revenue_12m_cents, p_revenue_total_cents, p_revenue_at);
  end if;
  update public.revenue_connections set status = 'ok', last_error = null, last_synced_at = now(),
    livemode = p_livemode
  where saas_id = p_saas_id;
end;
$$;
revoke execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz) to service_role;

-- 9. The scheduled run claims connections whose MRR or payments are due, and says whether payments
-- are: never read, read a day ago, or partly read and last read `p_interval` ago, so older
-- payments are read hour by hour. Claiming marks them, so an overlapping run skips them. It takes
-- over from claim_due_connections, which stays for the code deployed before it.
create function public.claim_due_verifications(p_limit integer, p_interval interval)
returns table(saas_id uuid, revenue_due boolean)
language sql security invoker set search_path = '' as $$
  with due as materialized (
    select d.saas_id,
      coalesce(d.revenue_checked_at, '-infinity') < now() - interval '23 hours'
        or (d.revenue_from is not null and not d.revenue_origin
          and d.revenue_checked_at < now() - p_interval) as revenue_due
    from public.revenue_connections d
    where coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity') < now() - p_interval
      or coalesce(d.revenue_checked_at, '-infinity') < now() - interval '23 hours'
      or (d.revenue_from is not null and not d.revenue_origin
        and d.revenue_checked_at < now() - p_interval)
    order by least(coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity'),
      coalesce(d.revenue_checked_at, '-infinity')), d.saas_id
    limit p_limit
    for update skip locked
  )
  update public.revenue_connections c set last_checked_at = now(),
    revenue_checked_at = case when due.revenue_due then now() else c.revenue_checked_at end
  from due
  where c.saas_id = due.saas_id
  returning c.saas_id, due.revenue_due;
$$;
revoke execute on function public.claim_due_verifications(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_due_verifications(integer, interval) to service_role;

-- 10. What a read of payments needs to know: the connection's provider, how far and until when
-- payments are stored, and the fingerprint and amount of each payment stored from `p_from`, so
-- unchanged ones are not valued again and changed ones can keep their share of tax.
create function public.revenue_read_state(p_saas_id uuid, p_from date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'provider', c.provider,
    'from', c.revenue_from,
    'origin', c.revenue_origin,
    'read_at', c.revenue_read_at,
    'stored', coalesce((
      select jsonb_object_agg(p.payment_hash, jsonb_build_array(p.fingerprint, p.amount))
      from private.revenue_payments p
      where p.saas_id = c.saas_id and p.day >= p_from
    ), '{}'::jsonb)
  )
  from public.revenue_connections c where c.saas_id = p_saas_id;
$$;
revoke execute on function public.revenue_read_state(uuid, date) from public, anon, authenticated;
grant execute on function public.revenue_read_state(uuid, date) to service_role;

-- 11. Stores a read of payments. `p_windows` are the day ranges ({from, to}, to exclusive or null
-- for up to now) that were read completely: a stored payment in them that the read did not list
-- is gone, such as an invoice that is no longer paid. `p_listed` holds every hash the read listed,
-- `p_payments` the new and changed ones. Returns the totals per currency of the last 30 days
-- (from `p_days30`), the last 12 months (from `p_months12`) and all time, each null while the
-- stored payments do not cover it yet.
create function public.record_revenue_payments(
  p_saas_id uuid, p_provider text, p_windows jsonb, p_listed text[], p_payments jsonb,
  p_from date, p_origin boolean, p_days30 date, p_months12 date
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_window jsonb;
begin
  if not exists(
    select 1 from public.revenue_connections where saas_id = p_saas_id and provider = p_provider
  ) then
    raise exception 'The product is not connected to this provider' using errcode = 'P0002';
  end if;
  if exists(
    select 1 from private.revenue_payments r
    join jsonb_to_recordset(p_payments) as p(hash text) on p.hash = r.payment_hash
    where r.saas_id <> p_saas_id
  ) then
    raise exception 'These payments already verify another SaaS' using errcode = '23505';
  end if;
  for v_window in select * from jsonb_array_elements(p_windows) loop
    delete from private.revenue_payments r
    where r.saas_id = p_saas_id and r.day >= (v_window->>'from')::date
      and (v_window->>'to' is null or r.day < (v_window->>'to')::date)
      and not (r.payment_hash = any(p_listed));
  end loop;
  insert into private.revenue_payments(payment_hash, saas_id, day, currency, amount, fingerprint)
  select p.hash, p_saas_id, p.day, p.currency, p.amount, p.fingerprint
  from jsonb_to_recordset(p_payments)
    as p(hash text, day date, currency text, amount bigint, fingerprint text)
  on conflict (payment_hash) do update set day = excluded.day, currency = excluded.currency,
    amount = excluded.amount, fingerprint = excluded.fingerprint;
  update public.revenue_connections set revenue_from = p_from, revenue_origin = p_origin,
    revenue_read_at = now(), revenue_note = null
  where saas_id = p_saas_id;
  return jsonb_build_object(
    'days30', case when p_origin or p_from <= p_days30 then (
      select coalesce(jsonb_object_agg(t.currency, t.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from private.revenue_payments
        where saas_id = p_saas_id and day >= p_days30 group by currency) t) end,
    'months12', case when p_origin or p_from <= p_months12 then (
      select coalesce(jsonb_object_agg(t.currency, t.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from private.revenue_payments
        where saas_id = p_saas_id and day >= p_months12 group by currency) t) end,
    'total', case when p_origin then (
      select coalesce(jsonb_object_agg(t.currency, t.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from private.revenue_payments
        where saas_id = p_saas_id group by currency) t) end
  );
end;
$$;
revoke execute on function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date) from public, anon, authenticated;
grant execute on function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date) to service_role;

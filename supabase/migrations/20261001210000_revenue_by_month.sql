-- Revenue by month, split into subscriptions and one-time purchases (the owner's request of
-- 2026-10-01): the product page charts it beside MRR over the same twelve months, and the revenue
-- rankings show it as their trend. Each stored payment records whether it paid for a
-- subscription, and the read of payments returns each month's totals by kind. Payments stored
-- before this have no kind; the next reads find them and read them again.

-- 1. A payment's kind: 'subscription', 'one_time', or 'unknown' where the provider gives daily
-- totals only. Null for a payment stored before kinds were read.
alter table private.revenue_payments
  add column kind text check (kind in ('subscription', 'one_time', 'unknown'));

-- 2. Snapshots and the public projection carry the months, oldest first: each month's revenue in
-- USD cents, with its split where every payment of the month has a kind.
alter table public.revenue_snapshots
  add column revenue_history jsonb
    check (revenue_history is null or jsonb_typeof(revenue_history) = 'array');
alter table public.public_metrics add column revenue_history jsonb;

-- 3. The months follow the revenue sharing choice. The split shows what subscriptions paid each
-- month, close to MRR, so it is public only when MRR is shared too.
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
    revenue_total_cents, revenue_history)
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
    case when v_settings.share_revenue then v_snapshot.revenue_total_cents end,
    case when v_settings.share_revenue and v_settings.share_mrr then v_snapshot.revenue_history
      when v_settings.share_revenue then (
        select jsonb_agg(month - 'subscription_cents' - 'one_time_cents' order by position)
        from jsonb_array_elements(v_snapshot.revenue_history) with ordinality as t(month, position))
    end
  )
  on conflict (saas_id) do update set mrr_cents = excluded.mrr_cents,
    customers = excluded.customers, livemode = excluded.livemode,
    verified_at = excluded.verified_at, launched_on = excluded.launched_on,
    mrr_history = excluded.mrr_history, mrr_growth_pct = excluded.mrr_growth_pct,
    provider = excluded.provider, revenue_30d_cents = excluded.revenue_30d_cents,
    revenue_12m_cents = excluded.revenue_12m_cents,
    revenue_total_cents = excluded.revenue_total_cents,
    revenue_history = excluded.revenue_history;
end;
$$;

-- 4. The public views gain the months, hidden like the other figures once the verification is a
-- week old. The column is appended, so the views are replaced in place.
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
    as revenue_total_cents,
  case when m.verified_at > now() - interval '7 days' then m.revenue_history end
    as revenue_history
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

create or replace view public.revenue_leaderboard with (security_invoker = true) as
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

-- 5. The verification write stores the months with the snapshot.
drop function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz,timestamptz);
create function public.record_revenue_verification(
  p_saas_id uuid, p_provider text, p_encrypted_key text, p_key_hint text, p_livemode boolean,
  p_mrr_cents bigint, p_customers integer, p_currencies jsonb, p_fx_date date,
  p_subscription_hashes text[], p_history jsonb, p_mrr_invoice_cents bigint,
  p_mrr_30d_ago_cents bigint, p_history_at timestamptz default null,
  p_revenue_30d_cents bigint default null, p_revenue_12m_cents bigint default null,
  p_revenue_total_cents bigint default null, p_revenue_at timestamptz default null,
  p_connected_at timestamptz default null, p_revenue_history jsonb default null
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
  elsif p_connected_at is not null and not exists(
    select 1 from public.revenue_connections
    where saas_id = p_saas_id and connected_at = p_connected_at
  ) then
    raise exception 'The connection changed during the check' using errcode = '40001';
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
      revenue_history = p_revenue_history, revenue_at = p_revenue_at,
      captured_at = clock_timestamp()
    where id = v_today;
  else
    insert into public.revenue_snapshots(saas_id, owner_id, provider, mrr_cents, customers,
      livemode, currencies, fx_date, history, mrr_invoice_cents, mrr_30d_ago_cents, history_at,
      revenue_30d_cents, revenue_12m_cents, revenue_total_cents, revenue_history, revenue_at)
    values (p_saas_id, v_owner, p_provider, p_mrr_cents, p_customers, p_livemode, p_currencies,
      p_fx_date, p_history, p_mrr_invoice_cents, p_mrr_30d_ago_cents, p_history_at,
      p_revenue_30d_cents, p_revenue_12m_cents, p_revenue_total_cents, p_revenue_history,
      p_revenue_at);
  end if;
  update public.revenue_connections set status = 'ok', last_error = null, last_synced_at = now(),
    livemode = p_livemode
  where saas_id = p_saas_id;
end;
$$;
revoke execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz,timestamptz,jsonb) to service_role;

-- 6. The read state gives each stored payment's kind, and the days of the payments from
-- `p_months_from` on that have none yet (`unsorted`, `to` exclusive), whose stored payments it
-- then gives too, so reading them again values only those that changed.
drop function public.revenue_read_state(uuid, date);
create function public.revenue_read_state(p_saas_id uuid, p_from date,
  p_months_from date default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with unsorted as (
    select min(p.day) as first_day, max(p.day) as last_day
    from private.revenue_payments p
    where p.saas_id = p_saas_id and p.kind is null and p.day >= p_months_from
  )
  select jsonb_build_object(
    'provider', c.provider,
    'connected_at', c.connected_at,
    'from', c.revenue_from,
    'origin', c.revenue_origin,
    'read_at', c.revenue_read_at,
    'unsorted', case when u.first_day is not null then
      jsonb_build_object('from', u.first_day, 'to', u.last_day + 1) end,
    'stored', coalesce((
      select jsonb_object_agg(p.payment_hash, jsonb_build_array(p.fingerprint, p.amount, p.kind))
      from private.revenue_payments p
      where p.saas_id = c.saas_id and p.day >= least(p_from, u.first_day)
    ), '{}'::jsonb)
  )
  from public.revenue_connections c cross join unsorted u where c.saas_id = p_saas_id;
$$;
revoke execute on function public.revenue_read_state(uuid, date, date) from public, anon, authenticated;
grant execute on function public.revenue_read_state(uuid, date, date) to service_role;

-- 7. A read of payments stores each payment's kind, and the kinds of unchanged payments it found
-- (`p_kinds`, [{hash, kind}]). With `p_months_from` (the first day of the oldest month) and
-- `p_months_to` (the first day after the newest), it also returns the months: from the first one
-- the stored payments cover, each month's totals per kind and currency, payments without a kind
-- under 'unknown'; null while they cover none. Left out, as by code deployed before this, kinds
-- stay as stored and no months are returned.
drop function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date,timestamptz);
create function public.record_revenue_payments(
  p_saas_id uuid, p_provider text, p_windows jsonb, p_listed text[], p_payments jsonb,
  p_from date, p_origin boolean, p_days30 date, p_months12 date,
  p_connected_at timestamptz default null, p_kinds jsonb default null,
  p_months_from date default null, p_months_to date default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_window jsonb;
  v_first_month date;
  v_months jsonb;
begin
  if not exists(
    select 1 from public.revenue_connections where saas_id = p_saas_id and provider = p_provider
  ) then
    raise exception 'The product is not connected to this provider' using errcode = 'P0002';
  end if;
  if p_connected_at is not null and not exists(
    select 1 from public.revenue_connections
    where saas_id = p_saas_id and connected_at = p_connected_at
  ) then
    raise exception 'The connection changed during the check' using errcode = '40001';
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
  insert into private.revenue_payments(payment_hash, saas_id, day, currency, amount, fingerprint,
    kind)
  select p.hash, p_saas_id, p.day, p.currency, p.amount, p.fingerprint, p.kind
  from jsonb_to_recordset(p_payments)
    as p(hash text, day date, currency text, amount bigint, fingerprint text, kind text)
  on conflict (payment_hash) do update set day = excluded.day, currency = excluded.currency,
    amount = excluded.amount, fingerprint = excluded.fingerprint,
    kind = coalesce(excluded.kind, private.revenue_payments.kind);
  update private.revenue_payments r set kind = k.kind
  from jsonb_to_recordset(coalesce(p_kinds, '[]'::jsonb)) as k(hash text, kind text)
  where r.payment_hash = k.hash and r.saas_id = p_saas_id;
  update public.revenue_connections set revenue_from = p_from, revenue_origin = p_origin,
    revenue_read_at = now(), revenue_note = null
  where saas_id = p_saas_id;

  -- A month counts once the stored payments cover all of its days.
  if p_months_from is not null and p_months_to is not null then
    v_first_month := case when p_origin then p_months_from else greatest(p_months_from,
      (date_trunc('month', (p_from - 1)::timestamp) + interval '1 month')::date) end;
    if v_first_month < p_months_to then
      select jsonb_build_object('from', v_first_month,
        'totals', coalesce(jsonb_object_agg(m.month, m.kinds), '{}'::jsonb))
      into v_months
      from (
        select k.month, jsonb_object_agg(k.kind, k.amounts) as kinds
        from (
          select s.month, s.kind, jsonb_object_agg(s.currency, s.amount) as amounts
          from (
            select to_char(r.day, 'YYYY-MM') as month, coalesce(r.kind, 'unknown') as kind,
              r.currency, sum(r.amount) as amount
            from private.revenue_payments r
            where r.saas_id = p_saas_id and r.day >= v_first_month and r.day < p_months_to
            group by 1, 2, 3
          ) s
          group by s.month, s.kind
        ) k
        group by k.month
      ) m;
    end if;
  end if;

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
  ) || case when p_months_from is not null then jsonb_build_object('months', v_months)
    else '{}'::jsonb end;
end;
$$;
revoke execute on function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date,timestamptz,jsonb,date,date) from public, anon, authenticated;
grant execute on function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date,timestamptz,jsonb,date,date) to service_role;

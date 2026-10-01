-- A verification or a read of payments is stored only for the connection it read (review of
-- 2026-10-01). A run that started with one key and finished after the founder connected another
-- key of the same provider, such as an hourly run or the first read of payments, wrote the old
-- account's figures, subscription claims and payments onto the new connection; the old payments
-- then stayed in the 12-month and all-time figures and kept the old account claimed. Both writes
-- now take the connection's connected_at from when the run read the key, and refuse a connection
-- connected since. Left out, as by code deployed before this, nothing is checked.

-- 1. The read state names the connection it belongs to.
create or replace function public.revenue_read_state(p_saas_id uuid, p_from date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'provider', c.provider,
    'connected_at', c.connected_at,
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

-- 2. A re-verification names the connection it read.
drop function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz);
create function public.record_revenue_verification(
  p_saas_id uuid, p_provider text, p_encrypted_key text, p_key_hint text, p_livemode boolean,
  p_mrr_cents bigint, p_customers integer, p_currencies jsonb, p_fx_date date,
  p_subscription_hashes text[], p_history jsonb, p_mrr_invoice_cents bigint,
  p_mrr_30d_ago_cents bigint, p_history_at timestamptz default null,
  p_revenue_30d_cents bigint default null, p_revenue_12m_cents bigint default null,
  p_revenue_total_cents bigint default null, p_revenue_at timestamptz default null,
  p_connected_at timestamptz default null
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
revoke execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz,bigint,bigint,bigint,timestamptz,timestamptz) to service_role;

-- 3. A read of payments names the connection it read.
drop function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date);
create function public.record_revenue_payments(
  p_saas_id uuid, p_provider text, p_windows jsonb, p_listed text[], p_payments jsonb,
  p_from date, p_origin boolean, p_days30 date, p_months12 date,
  p_connected_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_window jsonb;
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
revoke execute on function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date,timestamptz) from public, anon, authenticated;
grant execute on function public.record_revenue_payments(uuid,text,jsonb,text[],jsonb,date,boolean,date,date,timestamptz) to service_role;

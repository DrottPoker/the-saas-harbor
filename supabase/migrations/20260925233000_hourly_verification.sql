-- Revenue is verified every hour. The history and 30-day growth, which read far more of an
-- account, are read about once a day and carried over in between, and a product keeps one
-- snapshot per day: a re-verification replaces the day's snapshot instead of adding one.

-- 1. When the history in a snapshot was read. Earlier snapshots read it when they were taken.
alter table public.revenue_snapshots add column history_at timestamptz;
update public.revenue_snapshots set history_at = captured_at;

-- 2. A replaced snapshot updates the public projection like a new one.
drop trigger revenue_snapshots_refresh on public.revenue_snapshots;
create trigger revenue_snapshots_refresh after insert or update on public.revenue_snapshots
  for each row execute function private.refresh_public_metrics_trigger();

-- 3. The verification write replaces the day's snapshot for re-verifications, and records when
-- the history was read (null reads it again next time). A new key always starts a new snapshot.
drop function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint);
create function public.record_revenue_verification(
  p_saas_id uuid, p_provider text, p_encrypted_key text, p_key_hint text, p_livemode boolean,
  p_mrr_cents bigint, p_customers integer, p_currencies jsonb, p_fx_date date,
  p_subscription_hashes text[], p_history jsonb, p_mrr_invoice_cents bigint,
  p_mrr_30d_ago_cents bigint, p_history_at timestamptz default null
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
      history_at = p_history_at, captured_at = clock_timestamp()
    where id = v_today;
  else
    insert into public.revenue_snapshots(saas_id, owner_id, provider, mrr_cents, customers,
      livemode, currencies, fx_date, history, mrr_invoice_cents, mrr_30d_ago_cents, history_at)
    values (p_saas_id, v_owner, p_provider, p_mrr_cents, p_customers, p_livemode, p_currencies,
      p_fx_date, p_history, p_mrr_invoice_cents, p_mrr_30d_ago_cents, p_history_at);
  end if;
  update public.revenue_connections set status = 'ok', last_error = null, last_synced_at = now(),
    livemode = p_livemode
  where saas_id = p_saas_id;
end;
$$;
revoke execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.record_revenue_verification(uuid,text,text,text,boolean,bigint,integer,jsonb,date,text[],jsonb,bigint,bigint,timestamptz) to service_role;

-- 4. The scheduled run claims the connections that are due: not verified or checked for
-- `p_interval`, oldest first. Claiming marks them checked, so an overlapping run skips them.
create function public.claim_due_connections(p_limit integer, p_interval interval)
returns setof uuid language sql security invoker set search_path = '' as $$
  update public.revenue_connections c set last_checked_at = now()
  where c.saas_id in (
    select d.saas_id from public.revenue_connections d
    where coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity') < now() - p_interval
    order by coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity'), d.saas_id
    limit p_limit
    for update skip locked
  )
  returning c.saas_id;
$$;
revoke execute on function public.claim_due_connections(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_due_connections(integer, interval) to service_role;

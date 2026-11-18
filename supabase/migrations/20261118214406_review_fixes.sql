-- Fixes from the project review of 2026-11-18.

-- 1. Milestone places follow the leaderboard's order. Since 20261004120000_leaderboard_ties.sql the
-- leaderboard orders equal MRR by revenue of all time before the date listed, which this function
-- did not: on a leaderboard of 25 products, one at $0 MRR without sales could reach the top 10,
-- with its email and page, while the leaderboard showed it far lower, and one the leaderboard
-- placed there reached nothing. The place now comes from the leaderboard's own ordering. A product
-- still waiting for its provider (listing_pending) is not on the leaderboard and reaches nothing.
create or replace function private.record_milestones(p_saas_id uuid, p_notify boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_mrr bigint;
  v_ranked integer;
  v_rank integer;
  v_reached text[];
  v_new text[];
begin
  select s.owner_id, m.mrr_cents into v_owner, v_mrr
  from public.saas s
  join public.profiles p on p.id = s.owner_id
  join public.public_metrics m on m.saas_id = s.id
  where s.id = p_saas_id and s.hidden_at is null and not s.listing_pending
    and p.suspended_at is null
    and m.mrr_cents is not null and m.verified_at > now() - interval '7 days';
  if v_owner is null then return; end if;

  v_reached := array(
    select 'mrr-' || t from unnest(array[100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
      250000, 500000, 1000000]) as t
    where v_mrr >= t::bigint * 100);

  -- The same rows and the same order as public.leaderboard.
  select r.ranked, r.place into v_ranked, v_rank
  from (
    select s.id, (count(*) over ())::integer as ranked,
      (row_number() over (
        order by m.mrr_cents desc, m.revenue_total_cents desc nulls last, s.created_at asc,
          s.id asc))::integer as place
    from public.saas s
    join public.profiles p on p.id = s.owner_id
    join public.public_metrics m on m.saas_id = s.id
    where s.hidden_at is null and not s.listing_pending and p.suspended_at is null
      and m.mrr_cents is not null and m.verified_at > now() - interval '7 days'
  ) r
  where r.id = p_saas_id;
  if v_ranked >= 25 then
    if v_rank <= 10 then v_reached := array_append(v_reached, 'top-10'); end if;
    if v_rank <= 3 then v_reached := array_append(v_reached, 'top-3'); end if;
    if v_rank = 1 then v_reached := array_append(v_reached, 'top-1'); end if;
  end if;

  with added as (
    insert into public.saas_milestones(saas_id, milestone)
    select p_saas_id, k from unnest(v_reached) as k
    on conflict do nothing
    returning milestone
  )
  select array_agg(milestone) into v_new from added;

  -- One email for everything reached at once, such as several thresholds at the first
  -- verification.
  if p_notify and v_new is not null and private.wants_email(v_owner, 'milestone') then
    insert into private.email_outbox(user_id, kind, topic, payload)
    values (v_owner, 'milestone', 'milestone:' || p_saas_id,
      jsonb_build_object('saas_id', p_saas_id, 'milestones', to_jsonb(v_new)));
  end if;
end;
$$;

-- 2. Saving a product under Other publishes that founder's own pending product only. The trigger
-- runs before the row is checked, as the table's owner: an insert naming another founder's pending
-- product and the caller as owner, sent with ON CONFLICT DO NOTHING, met the product's existing
-- settings row and was skipped without an error, so the foreign key that ties the settings to the
-- product's owner never ran, and the product had been published by then. The update now names the
-- owner the row gives, which RLS has to accept as the caller.
create or replace function private.check_other_provider() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed boolean;
begin
  select allow_other_provider into allowed from private.listing_settings where singleton for share;
  if new.other_provider is not null then
    if not allowed then
      raise exception 'Connect a supported payment provider to list your SaaS' using errcode = 'P0001';
    end if;
    update public.saas set listing_pending = false
    where id = new.saas_id and owner_id = new.owner_id and listing_pending;
  end if;
  return new;
end;
$$;

-- 3. A connection whose verification keeps failing, such as one with a revoked key, is tried less
-- and less often: it was claimed every hour for good, with requests to the provider each time. It
-- now waits half as long as it has been failing, at least the interval and at most a day, so a
-- provider's bad hour is tried again within the hour and a dead key once a day. A verification
-- that succeeds, or a new key, ends it at once (status goes back to ok).
create or replace function public.claim_due_verifications(p_limit integer, p_interval interval)
returns table(saas_id uuid, revenue_due boolean)
language sql security invoker set search_path = '' as $$
  with due as materialized (
    select d.saas_id,
      coalesce(d.revenue_checked_at, '-infinity') < now() - interval '23 hours'
        or (d.revenue_from is not null and not d.revenue_origin
          and d.revenue_checked_at < now() - p_interval) as revenue_due
    from public.revenue_connections d
    where (coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity') < now() - p_interval
        or coalesce(d.revenue_checked_at, '-infinity') < now() - interval '23 hours'
        or (d.revenue_from is not null and not d.revenue_origin
          and d.revenue_checked_at < now() - p_interval))
      and (d.status <> 'error' or d.last_checked_at is null
        or d.last_checked_at < now() - least(interval '24 hours', greatest(p_interval,
          (d.last_checked_at - coalesce(d.last_synced_at, d.connected_at)) / 2)))
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

-- 4. Google Play's payments are stored per app: each day's sum was named by its day, kind and
-- currency alone, so two products' sums shared a name and the second product's payments were
-- refused as already verifying another. The names now start with the app's package name, so the
-- payments stored under the earlier names are read again.
delete from private.revenue_payments p
using public.revenue_connections c
where c.saas_id = p.saas_id and c.provider = 'googleplay';
update public.revenue_connections set revenue_from = null, revenue_origin = false,
  revenue_read_at = null, revenue_checked_at = null
where provider = 'googleplay';

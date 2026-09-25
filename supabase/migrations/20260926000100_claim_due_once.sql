-- claim_due_connections picked its rows in an IN subquery with LIMIT and FOR UPDATE SKIP LOCKED,
-- which PostgreSQL may run more than once, so one call could claim more than p_limit rows. A
-- materialized CTE picks them once.
create or replace function public.claim_due_connections(p_limit integer, p_interval interval)
returns setof uuid language sql security invoker set search_path = '' as $$
  with due as materialized (
    select d.saas_id from public.revenue_connections d
    where coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity') < now() - p_interval
    order by coalesce(greatest(d.last_synced_at, d.last_checked_at), '-infinity'), d.saas_id
    limit p_limit
    for update skip locked
  )
  update public.revenue_connections c set last_checked_at = now()
  from due
  where c.saas_id = due.saas_id
  returning c.saas_id;
$$;

-- Admins read the latest verified figures of any product: MRR and revenue, including figures the
-- founder keeps private and those of hidden products, with the founder's sharing choices. Like the
-- founder's own dashboard, figures count only while the product is connected. SECURITY DEFINER
-- because snapshots and settings are readable by their owner alone; it checks admin rights first
-- and returns no key, key hint or error text.
create function public.admin_revenue(p_ids uuid[])
returns table (saas_id uuid, provider text, status text, verified_at timestamptz,
  stale boolean, mrr_cents bigint, revenue_30d_cents bigint, revenue_12m_cents bigint,
  revenue_total_cents bigint, share_mrr boolean, share_revenue boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select c.saas_id, c.provider, c.status, s.captured_at,
    -- The public views hide figures after the same seven days.
    coalesce(s.captured_at <= now() - interval '7 days', false),
    s.mrr_cents, s.revenue_30d_cents, s.revenue_12m_cents, s.revenue_total_cents,
    coalesce(st.share_mrr, false), coalesce(st.share_revenue, false)
  from public.revenue_connections c
  left join lateral (
    select r.captured_at, r.mrr_cents, r.revenue_30d_cents, r.revenue_12m_cents,
      r.revenue_total_cents
    from public.revenue_snapshots r
    where r.saas_id = c.saas_id
    order by r.captured_at desc, r.seq desc
    limit 1
  ) s on true
  left join public.saas_settings st on st.saas_id = c.saas_id
  where c.saas_id = any(p_ids);
end;
$$;
revoke execute on function public.admin_revenue(uuid[]) from public, anon, service_role;
grant execute on function public.admin_revenue(uuid[]) to authenticated;

-- One choice shares or hides all verified revenue (the owner's request of 2026-10-01): MRR with
-- its history and growth, and revenue over 30 days, 12 months, all time and by month. A product
-- that hid either MRR or revenue before hides both. `share_revenue` is the choice and `share_mrr`
-- goes. save_saas still takes `p_share_mrr` from code deployed before this.

-- 1. A product that hid either hides both. The trigger refreshes the public projection.
update public.saas_settings set share_revenue = false
where share_revenue and not share_mrr;

-- 2. The projection shares every revenue figure, the split by month included, by the one choice.
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
    case when v_settings.share_revenue then v_snapshot.mrr_cents end,
    case when v_settings.share_customers then v_snapshot.customers end,
    v_snapshot.livemode,
    v_snapshot.captured_at,
    case when v_settings.share_launch then v_settings.launched_on end,
    case when v_settings.share_revenue then v_snapshot.history end,
    case when v_settings.share_revenue and v_snapshot.mrr_30d_ago_cents > 0 then
      round((v_snapshot.mrr_invoice_cents - v_snapshot.mrr_30d_ago_cents) * 100.0
        / v_snapshot.mrr_30d_ago_cents, 1)
    end,
    v_snapshot.provider,
    case when v_settings.share_revenue then v_snapshot.revenue_30d_cents end,
    case when v_settings.share_revenue then v_snapshot.revenue_12m_cents end,
    case when v_settings.share_revenue then v_snapshot.revenue_total_cents end,
    case when v_settings.share_revenue then v_snapshot.revenue_history end
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

-- 3. Admins see the one choice.
drop function public.admin_revenue(uuid[]);
create function public.admin_revenue(p_ids uuid[])
returns table(saas_id uuid, provider text, status text, verified_at timestamptz, stale boolean,
  mrr_cents bigint, revenue_30d_cents bigint, revenue_12m_cents bigint,
  revenue_total_cents bigint, share_revenue boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select c.saas_id, c.provider, c.status, s.captured_at,
    -- The public views hide figures after the same seven days.
    coalesce(s.captured_at <= now() - interval '7 days', false),
    s.mrr_cents, s.revenue_30d_cents, s.revenue_12m_cents, s.revenue_total_cents,
    coalesce(st.share_revenue, false)
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

-- 4. The founder's save takes the one choice in the place MRR had. `p_share_mrr` is what code
-- deployed before this sends with its own `p_share_revenue`; a product shares revenue only when
-- both say so. Drop it once that code is gone.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean);
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_revenue boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null, p_share_mrr boolean default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
  v_share boolean := coalesce(p_share_revenue, false) and coalesce(p_share_mrr, true);
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor) then
    raise exception 'Choose a username first' using errcode = 'P0001';
  end if;
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
  insert into public.saas_settings(saas_id, owner_id, share_revenue, share_customers, launched_on,
    share_launch)
  values (saved_id, actor, v_share, p_share_customers, p_launched_on, p_share_launch)
  on conflict (saas_id) do update set share_revenue = excluded.share_revenue,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch, updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean) to authenticated;

-- 5. The MRR choice goes, and every projection follows the one choice.
alter table public.saas_settings drop column share_mrr;
do $$
begin
  perform private.refresh_public_metrics(s.id) from public.saas s;
end;
$$;

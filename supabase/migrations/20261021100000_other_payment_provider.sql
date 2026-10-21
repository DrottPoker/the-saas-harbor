-- Every product names its payment provider (the owner's request of 2026-10-21). The product form
-- asks for it first: a supported provider is connected with a read-only key, and a founder whose
-- provider is not supported chooses Other and writes its name, which is kept here. Only the
-- founder reads it; admins see the names counted, to choose which providers to support next.

-- 1. The name, private to the founder like the rest of the settings. The app trims it and joins
-- runs of spaces.
alter table public.saas_settings add column other_provider text
  constraint saas_settings_other_provider_check check (other_provider is null or (
    other_provider = btrim(other_provider) and char_length(other_provider) between 1 and 60));

-- 2. The founder's save takes the name, or null when they chose a supported provider or have one
-- connected. Code deployed before this does not send it, so it defaults to null. `p_share_mrr` goes:
-- no deployed code sends it any more.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],boolean);
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_revenue boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null, p_other_provider text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
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
    share_launch, other_provider)
  values (saved_id, actor, coalesce(p_share_revenue, false), p_share_customers, p_launched_on,
    p_share_launch, p_other_provider)
  on conflict (saas_id) do update set share_revenue = excluded.share_revenue,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch, other_provider = excluded.other_provider,
    updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],text) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],text) to authenticated;

-- 3. Admins see which providers products use: those connected, the names written under Other
-- (spelled as most products spell them), and how many products have neither.
create function public.admin_payment_providers()
returns table(kind text, name text, products bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select 'connected'::text, c.provider, count(*)
  from public.revenue_connections c
  group by c.provider
  union all
  select 'other'::text, mode() within group (order by st.other_provider), count(*)
  from public.saas_settings st
  where st.other_provider is not null
    and not exists (select 1 from public.revenue_connections c where c.saas_id = st.saas_id)
  group by lower(st.other_provider)
  union all
  select 'none'::text, null::text, count(*)
  from public.saas s
  where not exists (select 1 from public.revenue_connections c where c.saas_id = s.id)
    and not exists (
      select 1 from public.saas_settings st
      where st.saas_id = s.id and st.other_provider is not null
    )
  order by 1, 3 desc, 2;
end;
$$;
revoke execute on function public.admin_payment_providers() from public, anon, service_role;
grant execute on function public.admin_payment_providers() to authenticated;

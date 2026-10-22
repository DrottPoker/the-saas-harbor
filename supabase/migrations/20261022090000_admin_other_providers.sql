-- Admins see what each product's founder wrote under Other, on the product's page and in the
-- product lists (the owner's request of 2026-10-22), as they see its verified figures. Only for
-- products that are not connected, like the counts on the overview.
create function public.admin_other_providers(p_ids uuid[])
returns table(saas_id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select st.saas_id, st.other_provider
  from public.saas_settings st
  where st.saas_id = any(p_ids)
    and st.other_provider is not null
    and not exists (select 1 from public.revenue_connections c where c.saas_id = st.saas_id);
end;
$$;
revoke execute on function public.admin_other_providers(uuid[]) from public, anon, service_role;
grant execute on function public.admin_other_providers(uuid[]) to authenticated;

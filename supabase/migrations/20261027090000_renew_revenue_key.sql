-- Some providers rotate a connection's credentials when they are used, such as Mercado Pago, whose
-- refresh token works only once. The server stores the new key right after the read that got it,
-- before anything else can fail, and only for the connection it read: a key the founder connected
-- in between is kept.
create function public.renew_revenue_key(
  p_saas_id uuid, p_connected_at timestamptz, p_encrypted_key text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.revenue_connections set encrypted_key = p_encrypted_key
  where saas_id = p_saas_id and connected_at = p_connected_at;
  return found;
end;
$$;
revoke execute on function public.renew_revenue_key(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.renew_revenue_key(uuid, timestamptz, text) to service_role;

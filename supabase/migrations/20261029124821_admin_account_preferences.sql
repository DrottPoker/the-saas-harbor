-- Only admins read the latest saved language and display currency, including unfinished accounts.
create function public.admin_account_preferences(p_ids uuid[])
returns table (id uuid, locale text, currency text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select u.id, u.raw_user_meta_data ->> 'locale', u.raw_user_meta_data ->> 'currency'
  from auth.users u
  where u.id = any(p_ids);
end;
$$;
revoke execute on function public.admin_account_preferences(uuid[]) from public, anon, service_role;
grant execute on function public.admin_account_preferences(uuid[]) to authenticated;

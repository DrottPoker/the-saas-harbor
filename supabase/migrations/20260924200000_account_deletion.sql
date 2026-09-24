-- Makers can delete their own account. Deleting the auth user removes everything they own through
-- foreign keys: profile, products, settings, Stripe connections with their encrypted keys,
-- subscription claims, verification snapshots and the public projection. Images must be removed
-- through the Storage API before this runs: storage.objects has no foreign key to auth.users and
-- blocks SQL deletes, and the files themselves live outside the database.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
begin
  if v_user is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;
  -- Deletion needs a password sign-in from the last five minutes, so a leaked or long-lived
  -- session token alone cannot delete an account. The app signs in again with the password
  -- the maker confirms, and calls this function with that fresh session.
  if not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_amr) = 'array' then v_amr else '[]' end) as entry
    where entry ->> 'method' = 'password'
      and jsonb_typeof(entry -> 'timestamp') = 'number'
      and (entry ->> 'timestamp')::numeric >= extract(epoch from now()) - 300
  ) then
    raise exception 'Confirm your password to delete your account' using errcode = '42501';
  end if;
  -- Auth records that are not linked to the user by a foreign key: the audit log keeps the
  -- email address and IP address of account events, and older rows can outlive their session.
  delete from auth.audit_log_entries
  where payload ->> 'actor_id' = v_user::text or payload -> 'traits' ->> 'user_id' = v_user::text;
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.flow_state where user_id = v_user;
  delete from auth.users where id = v_user;
end;
$$;
revoke execute on function public.delete_account() from public, anon, service_role;
grant execute on function public.delete_account() to authenticated;

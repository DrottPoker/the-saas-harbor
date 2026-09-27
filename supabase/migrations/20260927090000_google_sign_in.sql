-- Sign-in with Google. An account that Google creates carries no username and no accepted Terms
-- version, so the sign-up triggers make no profile and record nothing. The app then asks for both,
-- and complete_signup() creates the profile and records the version, as email sign-up does.
-- Deleting an account accepts a fresh Google sign-in in place of a password, for accounts that
-- have none. Google accounts whose sign-up is never finished are deleted after seven days.

-- Removes an account and the Auth records that are not linked to it by a foreign key: the audit
-- log keeps the email address and IP address of account events, and older rows can outlive their
-- session. Other users' queued emails and live-update events name the user by id; they go too.
create function private.remove_account(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.audit_log_entries
  where payload ->> 'actor_id' = p_user::text or payload -> 'traits' ->> 'user_id' = p_user::text;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.flow_state where user_id = p_user;
  delete from private.email_outbox o where o.payload ->> 'sender_id' = p_user::text;
  delete from realtime.messages m
  where m.topic = 'user:' || p_user::text or m.payload ->> 'sender_id' = p_user::text;
  delete from auth.users where id = p_user;
end;
$$;
revoke execute on function private.remove_account(uuid)
  from public, anon, authenticated, service_role;

-- Deletion needs a password or Google sign-in from the last five minutes, so a leaked or
-- long-lived session token alone cannot delete an account. The app signs in again with the
-- password the user confirms, or sends them through Google again, and calls this function with
-- that fresh session. An email link sign-in is not enough.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
begin
  if v_user is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_amr) = 'array' then v_amr else '[]' end) as entry
    where entry ->> 'method' in ('password', 'oauth')
      and jsonb_typeof(entry -> 'timestamp') = 'number'
      and (entry ->> 'timestamp')::numeric >= extract(epoch from now()) - 300
  ) then
    raise exception 'Confirm it is you to delete your account' using errcode = '42501';
  end if;
  perform private.remove_account(v_user);
end;
$$;

-- Finishes a sign-up that did not choose a username or accept the Terms, such as one through
-- Google: creates the profile with the username as name and address, and records the accepted
-- version of the terms. The app passes the current version; a future date is refused.
create function public.complete_signup(p_username text, p_terms_version date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_problem text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_terms_version is null or p_terms_version > current_date then
    raise exception 'Accept the current Terms of Service' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Sign-up is already finished' using errcode = 'P0001';
  end if;
  v_problem := private.username_problem(p_username, v_user);
  if v_problem is not null then
    raise exception 'username %', v_problem using errcode = 'P0001';
  end if;
  insert into public.profiles(id, name, slug) values (v_user, p_username, p_username);
  insert into private.terms_acceptances(user_id, version) values (v_user, p_terms_version)
  on conflict do nothing;
exception when unique_violation then
  raise exception 'username taken' using errcode = 'P0001';
end;
$$;
revoke execute on function public.complete_signup(text, date) from public, anon;
grant execute on function public.complete_signup(text, date) to authenticated;

-- Accounts created through Google (or another provider) that never finished sign-up within seven
-- days: no profile, so no products, and no uploaded images. Returns how many were deleted.
create function private.delete_unfinished_signups() returns integer
language plpgsql set search_path = '' as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  for v_user in
    select u.id from auth.users u
    where coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
      and u.created_at < now() - interval '7 days'
      and not exists (select 1 from public.profiles p where p.id = u.id)
      and not exists (select 1 from storage.objects o where o.owner_id = u.id::text)
  loop
    perform private.remove_account(v_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function private.delete_unfinished_signups()
  from public, anon, authenticated, service_role;

select cron.schedule('harbor-unfinished-signups', '53 3 * * *',
  $$ select private.delete_unfinished_signups() $$);

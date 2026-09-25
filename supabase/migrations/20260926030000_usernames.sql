-- Usernames. A user's username is their profile slug: shown as @username and used in the address
-- /users/<username>. Users choose it at sign-up and can change it on their profile; it no longer
-- follows the name. A changed username frees the old one, with no redirect, as before. Profiles
-- made without one (the admin API, older accounts, tests) still get a slug from their name.

-- Names that would look official or confuse people, never available as usernames.
create function private.username_reserved(p_username text) returns boolean
language sql immutable set search_path = '' as $$
  select p_username = any (array[
    'about', 'admin', 'administrator', 'api', 'app', 'auth', 'dashboard', 'harbor', 'help',
    'me', 'messages', 'mod', 'moderator', 'new', 'null', 'official', 'privacy', 'report', 'root',
    'saas', 'saasharbor', 'security', 'settings', 'staff', 'support', 'system', 'team', 'terms',
    'the-saas-harbor', 'thesaasharbor', 'undefined', 'user', 'users'
  ]);
$$;
revoke execute on function private.username_reserved(text) from public, anon, authenticated;

-- Why a username cannot be used by this user: 'format', 'reserved' or 'taken', or null when it can.
-- 3 to 30 lowercase letters, digits and single hyphens, not at the start or end.
create function private.username_problem(p_username text, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_username is null or char_length(p_username) not between 3 and 30
      or p_username !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then 'format'
    when private.username_reserved(p_username) then 'reserved'
    when exists (select 1 from public.profiles p
      where p.slug = p_username and p.id is distinct from p_user) then 'taken'
  end;
$$;
revoke execute on function private.username_problem(text, uuid)
  from public, anon, authenticated;

-- For the sign-up and profile forms. Profiles are public, so whether a username is taken is too.
create function public.check_username(p_username text) returns text
language sql stable security definer set search_path = '' as $$
  select private.username_problem(p_username, auth.uid());
$$;
revoke execute on function public.check_username(text) from public;
grant execute on function public.check_username(text) to anon, authenticated;

-- Changes the signed-in user's username.
create function public.set_username(p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_problem text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_problem := private.username_problem(p_username, v_user);
  if v_problem is not null then
    raise exception 'username %', v_problem using errcode = 'P0001';
  end if;
  update public.profiles set slug = p_username, updated_at = now() where id = v_user;
  if not found then
    raise exception 'Create your profile first' using errcode = 'P0002';
  end if;
exception when unique_violation then
  raise exception 'username taken' using errcode = 'P0001';
end;
$$;
revoke execute on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;

-- The slug no longer follows the name. A new profile without one gets it from its name.
create or replace function private.profile_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is null then
    new.slug := private.assign_slug('profile', new.id, new.name);
  end if;
  return new;
end;
$$;
drop trigger profile_slug on public.profiles;
create trigger profile_slug before insert on public.profiles
  for each row execute function private.profile_slug();

-- Sign-up sends the chosen username as user metadata. The profile is created with it as both
-- username and name, so it is reserved at once. When it was taken in the meantime, the profile
-- still gets the name and a slug made from it; a missing or invalid username creates no profile,
-- as before. Nothing here ever stops a sign-up.
create function private.create_profile_from_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if private.username_problem(v_username, new.id) is distinct from null
    and private.username_problem(v_username, new.id) <> 'taken' then
    return new;
  end if;
  begin
    insert into public.profiles(id, name, slug)
    values (new.id, v_username,
      case when private.username_problem(v_username, new.id) is null then v_username end)
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles(id, name) values (new.id, v_username) on conflict (id) do nothing;
  end;
  return new;
end;
$$;
revoke execute on function private.create_profile_from_signup() from public, anon, authenticated;
create trigger create_profile_from_signup after insert on auth.users
  for each row execute function private.create_profile_from_signup();

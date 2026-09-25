-- A username can be changed once every 30 days. The first change is free: the username chosen at
-- sign-up, or a profile's first slug, does not count. When a user last changed it is private, so
-- it lives here rather than on the public profile, and goes with the account.
create table private.username_changes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table private.username_changes enable row level security;
revoke all on private.username_changes from public, anon, authenticated;

-- When the signed-in user may change their username again, or null when they may now.
create function public.username_change_available_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select c.changed_at + interval '30 days' from private.username_changes c
  where c.user_id = auth.uid() and c.changed_at + interval '30 days' > now();
$$;
revoke execute on function public.username_change_available_at() from public, anon;
grant execute on function public.username_change_available_at() to authenticated;

create or replace function public.set_username(p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_problem text;
  v_current text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select slug into v_current from public.profiles where id = v_user;
  if v_current is null then
    raise exception 'Create your profile first' using errcode = 'P0002';
  end if;
  -- Saving the same username is not a change.
  if v_current = p_username then
    return;
  end if;
  if public.username_change_available_at() is not null then
    raise exception 'username locked' using errcode = 'P0001';
  end if;
  v_problem := private.username_problem(p_username, v_user);
  if v_problem is not null then
    raise exception 'username %', v_problem using errcode = 'P0001';
  end if;
  update public.profiles set slug = p_username, updated_at = now() where id = v_user;
  insert into private.username_changes(user_id, changed_at) values (v_user, now())
  on conflict (user_id) do update set changed_at = excluded.changed_at;
exception when unique_violation then
  raise exception 'username taken' using errcode = 'P0001';
end;
$$;

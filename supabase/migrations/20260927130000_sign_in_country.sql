-- The country of each account's latest sign-in, for admins reviewing the account. The host's IP
-- geolocation gives a two-letter code; the IP address itself is never stored. Each sign-in
-- replaces the row, and deleting the account removes it.
create table private.sign_in_countries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  signed_in_at timestamptz not null default now()
);
alter table private.sign_in_countries enable row level security;
revoke all on private.sign_in_countries from public, anon, authenticated;

-- Called by the app right after a sign-in, with the session that sign-in opened. The code is what
-- the host reported for this request; like any IP location, a VPN changes it.
create function public.record_sign_in_country(p_country text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_country is null or p_country !~ '^[A-Z]{2}$' then
    return;
  end if;
  insert into private.sign_in_countries(user_id, country, signed_in_at)
  values (v_user, p_country, now())
  on conflict (user_id) do update
    set country = excluded.country, signed_in_at = excluded.signed_in_at;
end;
$$;
revoke execute on function public.record_sign_in_country(text) from public, anon, service_role;
grant execute on function public.record_sign_in_country(text) to authenticated;

-- The account page in the admin panel also shows that country.
drop function public.admin_account(uuid);
create function public.admin_account(p_id uuid)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, is_admin boolean, country text, country_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    exists (select 1 from private.admins a where a.user_id = u.id), c.country, c.signed_in_at
  from auth.users u
  left join private.sign_in_countries c on c.user_id = u.id
  where u.id = p_id;
end;
$$;
revoke execute on function public.admin_account(uuid) from public, anon, service_role;
grant execute on function public.admin_account(uuid) to authenticated;

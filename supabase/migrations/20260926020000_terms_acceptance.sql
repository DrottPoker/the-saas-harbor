-- Which version of the Terms of Service each account accepted, and when. Sign-up sends the version
-- the user ticked (the date of the terms) as user metadata, and this trigger copies it when Auth
-- creates the user, so the record does not change when a user later edits their own metadata.
-- Accounts created another way (the admin API, tests) have no record. Deleting the account
-- removes it.
create table private.terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  version date not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table private.terms_acceptances enable row level security;
revoke all on private.terms_acceptances from public, anon, authenticated;

create function private.record_terms_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_version text := new.raw_user_meta_data ->> 'terms_version';
begin
  if v_version ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      insert into private.terms_acceptances(user_id, version, accepted_at)
      values (new.id, v_version::date, coalesce(new.created_at, now()));
    exception when datetime_field_overflow or invalid_datetime_format then
      -- An impossible date records nothing, like a missing one; sign-up itself goes on.
      null;
    end;
  end if;
  return new;
end;
$$;
revoke execute on function private.record_terms_acceptance() from public, anon, authenticated;

create trigger record_terms_acceptance after insert on auth.users
  for each row execute function private.record_terms_acceptance();

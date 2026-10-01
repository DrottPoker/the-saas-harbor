-- Sign-ups that never finish are deleted after seven days (the owner's decision of 2026-10-01).
-- Before, only accounts created through Google or GitHub without a profile were: a sign-up with
-- an email address that was never confirmed kept that address and its username for good, and a
-- sign-up made straight through the Auth API without the Terms, which has no profile since
-- 20261001100000, was never removed. Now an account is deleted when, seven days after it was
-- created, its email address is still unconfirmed or it still has no profile. Accounts with
-- uploaded images, products or admin rights are kept.
create or replace function private.delete_unfinished_signups() returns integer
language plpgsql set search_path = '' as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  for v_user in
    select u.id from auth.users u
    where u.created_at < now() - interval '7 days'
      and (u.email_confirmed_at is null
        or not exists (select 1 from public.profiles p where p.id = u.id))
      and not exists (select 1 from storage.objects o where o.owner_id = u.id::text)
      and not exists (select 1 from public.saas s where s.owner_id = u.id)
      and not exists (select 1 from private.admins a where a.user_id = u.id)
  loop
    perform private.remove_account(v_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

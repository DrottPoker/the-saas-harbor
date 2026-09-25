-- Feedback from signed-in users to the admins: bugs, suggestions and anything else. Users send it
-- through submit_feedback() and do not read it back; admins read it under RLS and mark it handled
-- through admin_set_feedback_handled(). It goes with the sender's account.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bug', 'suggestion', 'other')),
  message text not null check (char_length(message) between 10 and 2000),
  -- The site path the user sent it from, such as /dashboard. Never another site.
  page text check (page is null or (char_length(page) <= 300 and page ~ '^/([^/\\].*)?$')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  -- Who handled it; cleared when that admin's account is deleted, while handled_at stays.
  handled_by uuid references auth.users(id) on delete set null,
  constraint feedback_handled check (handled_by is null or handled_at is not null)
);
create index feedback_new_idx on public.feedback(created_at) where handled_at is null;
create index feedback_created_idx on public.feedback(created_at desc);
create index feedback_user_idx on public.feedback(user_id, created_at desc);
create index feedback_handled_by_idx on public.feedback(handled_by);

alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
grant select on public.feedback to authenticated;
create policy feedback_admin_read on public.feedback for select to authenticated
  using ((select public.is_admin()));

create function public.submit_feedback(p_kind text, p_message text, p_page text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_message text := btrim(coalesce(p_message, ''));
  v_page text := nullif(btrim(coalesce(p_page, '')), '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to send feedback' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('bug', 'suggestion', 'other') then
    raise exception 'Choose what kind of feedback it is';
  end if;
  if char_length(v_message) < 10 then
    raise exception 'Write at least 10 characters';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'Keep it under 2,000 characters';
  end if;
  -- A page that is not a path on this site is left out rather than refused.
  if v_page is not null and (char_length(v_page) > 300 or v_page !~ '^/([^/\\].*)?$') then
    v_page := null;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.suspended_at is not null) then
    raise exception 'Your account is suspended, so you cannot send feedback';
  end if;
  -- Counted one at a time per user, so parallel requests cannot pass the limit.
  perform pg_advisory_xact_lock(hashtextextended('submit_feedback:' || v_user::text, 0));
  if (select count(*) from public.feedback f
      where f.user_id = v_user and f.created_at > now() - interval '1 hour') >= 5
    or (select count(*) from public.feedback f
      where f.user_id = v_user and f.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have sent a lot of feedback. Try again later';
  end if;
  insert into public.feedback(user_id, kind, message, page)
  values (v_user, p_kind, v_message, v_page)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.submit_feedback(text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text) to authenticated;

-- Marks feedback handled, or new again. Admins only.
create function public.admin_set_feedback_handled(p_feedback uuid, p_handled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.feedback
  set handled_at = case when p_handled then now() end,
    handled_by = case when p_handled then v_admin end
  where id = p_feedback;
  if not found then
    raise exception 'This feedback could not be found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.admin_set_feedback_handled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_feedback_handled(uuid, boolean) to authenticated;

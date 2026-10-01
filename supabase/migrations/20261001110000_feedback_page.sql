-- The page feedback was sent from holds no spaces, control characters or backslashes (review of
-- 2026-10-01). Browsers drop tabs and line breaks from an address, so a page such as /<tab>/x.example
-- passed as a path here and became a link to x.example in the admin panel.

alter table public.feedback drop constraint feedback_page_check;
alter table public.feedback add constraint feedback_page_check check (page is null or
  (char_length(page) <= 300 and page ~ '^/([^/\\].*)?$' and page !~ '[[:space:][:cntrl:]]'
    and strpos(page, '\') = 0));

create or replace function public.submit_feedback(p_kind text, p_message text, p_page text)
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
  -- A page that is not a plain path on this site is left out rather than refused.
  if v_page is not null and (char_length(v_page) > 300 or v_page !~ '^/([^/\\].*)?$'
    or v_page ~ '[[:space:][:cntrl:]]' or strpos(v_page, '\') > 0) then
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

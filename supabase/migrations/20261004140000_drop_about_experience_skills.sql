-- Profiles no longer have About, Experience or Skills (the owner's request of 2026-10-04). The
-- stored text, roles and skills are deleted. Copies kept with earlier reports stay as they are.

-- 1. save_profile without them.
drop function public.save_profile(text, text, text, text, text, text, text, text, text, text[],
  text, jsonb);
create function public.save_profile(
  p_name text, p_headline text, p_location text, p_website text, p_linkedin_url text,
  p_github_url text, p_x_url text, p_social_url text, p_avatar_path text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.profiles set name = p_name, headline = p_headline, location = p_location,
    website = p_website, linkedin_url = p_linkedin_url, github_url = p_github_url,
    x_url = p_x_url, social_url = p_social_url, avatar_path = p_avatar_path, updated_at = now()
  where id = v_user;
  if not found then
    raise exception 'Choose a username first' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.save_profile(text, text, text, text, text, text, text, text,
  text) from public, anon;
grant execute on function public.save_profile(text, text, text, text, text, text, text, text,
  text) to authenticated;

-- 2. A report on a profile copies only the fields that are left.
CREATE OR REPLACE FUNCTION public.submit_report(p_target text, p_id uuid, p_reason text, p_details text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reporter uuid := auth.uid();
  v_details text := btrim(coalesce(p_details, ''));
  v_subject uuid;
  v_saas uuid;
  v_message uuid;
  v_content jsonb;
  v_id uuid;
begin
  if v_reporter is null then
    raise exception 'Sign in to report something' using errcode = '42501';
  end if;
  if p_reason is null
    or p_reason not in ('spam', 'misleading', 'impersonation', 'harassment', 'illegal', 'other') then
    raise exception 'Choose a reason';
  end if;
  if char_length(v_details) > 1000 then
    raise exception 'Keep the details under 1,000 characters';
  end if;
  if p_reason in ('illegal', 'other') and v_details = '' then
    raise exception 'Describe the problem so it can be reviewed';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_reporter and p.suspended_at is not null) then
    raise exception 'Your account is suspended, so you cannot send reports';
  end if;
  -- A reporter's reports are counted one at a time, so parallel requests cannot pass the limit.
  perform pg_advisory_xact_lock(hashtextextended('submit_report:' || v_reporter::text, 0));
  if (select count(*) from public.reports r
      where r.reporter_id = v_reporter and r.created_at > now() - interval '1 hour') >= 10
    or (select count(*) from public.reports r
      where r.reporter_id = v_reporter and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have sent many reports. Try again later';
  end if;

  if p_target = 'saas' then
    select s.owner_id, s.id, jsonb_build_object('name', s.name, 'tagline', s.tagline,
        'description', s.description, 'category', s.category, 'website', s.website,
        'logo_path', s.logo_path)
      into v_subject, v_saas, v_content
    from public.saas s join public.profiles p on p.id = s.owner_id
    where s.id = p_id and s.hidden_at is null and p.suspended_at is null;
    if v_subject is null then raise exception 'This product could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report your own product'; end if;
  elsif p_target = 'profile' then
    select p.id, jsonb_build_object('name', p.name, 'headline', p.headline,
        'location', p.location, 'website', p.website,
        'linkedin_url', p.linkedin_url, 'github_url', p.github_url, 'x_url', p.x_url,
        'social_url', p.social_url, 'avatar_path', p.avatar_path)
      into v_subject, v_content
    from public.profiles p where p.id = p_id and p.suspended_at is null;
    if v_subject is null then raise exception 'This user could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report yourself'; end if;
  elsif p_target = 'message' then
    -- The participant check: only the two makers in the conversation can report its messages.
    select m.sender_id, m.id, jsonb_build_object('body', m.body, 'sent_at', m.created_at)
      into v_subject, v_message, v_content
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = p_id and v_reporter in (c.user_a, c.user_b);
    if v_subject is null then raise exception 'This message could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report your own message'; end if;
  else
    raise exception 'Choose what to report';
  end if;

  begin
    insert into public.reports(reporter_id, subject_id, target, saas_id, message_id, reason,
      details, content)
    values (v_reporter, v_subject, p_target, v_saas, v_message, p_reason, v_details, v_content)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already reported this, and it is waiting for review';
  end;
  return v_id;
end;
$function$;

-- 3. The roles, About and skills, with the checks only they used.
drop table public.profile_experience;
drop function private.limit_profile_experience();
alter table public.profiles drop column bio, drop column skills;
drop function private.valid_labels(text[], integer, integer);

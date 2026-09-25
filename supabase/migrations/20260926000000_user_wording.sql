-- People are users; the founder is the user who owns a product. Messages that name a person
-- say user or profile instead of maker. The functions are otherwise unchanged.

CREATE OR REPLACE FUNCTION private.decision_note(p_note text, p_required boolean)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_required and v_note = '' then
    raise exception 'Explain the decision. The user sees this explanation';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the explanation under 1,000 characters';
  end if;
  return v_note;
end;
$function$

;

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
        'location', p.location, 'bio', p.bio, 'website', p.website,
        'linkedin_url', p.linkedin_url, 'github_url', p.github_url, 'x_url', p.x_url,
        'social_url', p.social_url, 'skills', to_jsonb(p.skills), 'avatar_path', p.avatar_path)
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
$function$

;

CREATE OR REPLACE FUNCTION private.check_report(p_report uuid, p_subject uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_report is not null and not exists (
    select 1 from public.reports r where r.id = p_report and r.subject_id = p_subject
  ) then
    raise exception 'This report is about another user';
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.admin_suspend_account(p_profile uuid, p_reason text, p_note text, p_report uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := private.require_admin();
  v_reason public.moderation_reason := private.decision_reason(p_reason);
  v_note text := private.decision_note(p_note, true);
  v_profile public.profiles%rowtype;
begin
  if p_profile = v_admin then raise exception 'You cannot suspend your own account'; end if;
  if exists (select 1 from private.admins a where a.user_id = p_profile) then
    raise exception 'Remove admin rights before suspending this account';
  end if;
  select * into v_profile from public.profiles where id = p_profile for update;
  if v_profile.id is null then raise exception 'This account has no profile'; end if;
  if v_profile.suspended_at is not null then raise exception 'This account is already suspended'; end if;
  perform private.check_report(p_report, p_profile);
  update public.profiles
  set suspended_at = now(), suspended_reason = v_reason, suspended_note = v_note
  where id = p_profile;
  insert into public.moderation_log(admin_id, subject_id, action, report_id, target_label, reason,
    note)
  values (v_admin, p_profile, 'suspend_account', p_report, v_profile.name, v_reason, v_note);
  -- A suspension answers every open report about the maker's products, profile and messages.
  update public.reports set status = 'actioned', resolved_at = now()
  where status = 'open' and subject_id = p_profile;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.admin_restore_account(p_profile uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := private.require_admin();
  v_note text := private.decision_note(p_note, false);
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_profile for update;
  if v_profile.id is null then raise exception 'This account has no profile'; end if;
  if v_profile.suspended_at is null then raise exception 'This account is not suspended'; end if;
  update public.profiles set suspended_at = null, suspended_reason = null, suspended_note = ''
  where id = p_profile;
  insert into public.moderation_log(admin_id, subject_id, action, target_label, note)
  values (v_admin, p_profile, 'restore_account', v_profile.name, v_note);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.send_message(p_recipient uuid, p_body text)
 RETURNS messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sender uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_a uuid := least(v_sender, p_recipient);
  v_b uuid := greatest(v_sender, p_recipient);
  v_conversation uuid;
  v_message public.messages%rowtype;
begin
  if v_sender is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if p_recipient is null or p_recipient = v_sender then
    raise exception 'Choose another user to message';
  end if;
  if v_body = '' then
    raise exception 'Write a message first';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Messages can be up to 4,000 characters';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_sender) then
    raise exception 'Set up your profile before sending messages';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_sender and p.suspended_at is not null) then
    raise exception 'Your account is suspended, so you cannot send messages';
  end if;
  -- One answer for a deleted and a suspended account, so it does not reveal a suspension.
  if not exists (
    select 1 from public.profiles p where p.id = p_recipient and p.suspended_at is null
  ) then
    raise exception 'This user cannot receive messages';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_recipient and b.blocked_id = v_sender)
       or (b.blocker_id = v_sender and b.blocked_id = p_recipient)
  ) then
    raise exception 'Messages between you and this user are blocked';
  end if;
  -- Limits that stop one account from flooding others. A sender's messages are counted one at a
  -- time, so parallel requests cannot all pass the same count.
  perform pg_advisory_xact_lock(hashtextextended('send_message:' || v_sender::text, 0));
  if (select count(*) from public.messages m
      where m.sender_id = v_sender and m.created_at > now() - interval '1 minute') >= 20
    or (select count(*) from public.messages m
      where m.sender_id = v_sender and m.created_at > now() - interval '1 day') >= 500 then
    raise exception 'You are sending messages too quickly. Try again later';
  end if;
  select c.id into v_conversation from public.conversations c
  where c.user_a = v_a and c.user_b = v_b;
  if v_conversation is null then
    if (select count(*) from public.conversations c
        where c.started_by = v_sender and c.created_at > now() - interval '1 day') >= 20 then
      raise exception 'You have started many conversations today. Try again tomorrow';
    end if;
    insert into public.conversations(user_a, user_b, started_by) values (v_a, v_b, v_sender)
    on conflict on constraint conversations_pair do nothing
    returning id into v_conversation;
    -- Both makers may start the conversation at the same moment.
    if v_conversation is null then
      select c.id into v_conversation from public.conversations c
      where c.user_a = v_a and c.user_b = v_b;
    end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body)
  values (v_conversation, v_sender, v_body)
  returning * into v_message;
  update public.conversations set last_message_at = v_message.created_at
  where id = v_conversation;
  insert into public.conversation_reads(conversation_id, user_id, read_at)
  values (v_conversation, v_sender, v_message.created_at)
  on conflict on constraint conversation_reads_pkey
  do update set read_at = greatest(public.conversation_reads.read_at, excluded.read_at);
  return v_message;
end;
$function$

;

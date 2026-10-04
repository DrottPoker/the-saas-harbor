-- Feedback from visitors without an account (the owner's request of 2026-10-04), so someone who
-- gets stuck before signing up can still tell us. The server sends it through
-- submit_visitor_feedback(), which only the service role may call, with an optional email address
-- for a reply. The sender is the day's hash of address and user agent, as in the site statistics,
-- so the address itself is never stored; it limits how much one visitor sends. Visitor feedback is
-- deleted after 12 months.

-- 1. Feedback comes from a user or from a visitor; only a visitor leaves an address for a reply,
-- since a user's is in their account.
alter table public.feedback
  alter column user_id drop not null,
  add column visitor bytea check (visitor is null or octet_length(visitor) = 16),
  add column reply_email text check (reply_email is null
    or (char_length(reply_email) <= 254 and reply_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  add constraint feedback_sender check ((user_id is null) <> (visitor is null)),
  add constraint feedback_reply check (reply_email is null or user_id is null);
create index feedback_visitor_idx on public.feedback(visitor, created_at) where visitor is not null;

-- 2. What the server calls for a visitor who is not signed in. The checks are submit_feedback's.
create function public.submit_visitor_feedback(p_ip text, p_user_agent text, p_kind text,
  p_message text, p_page text, p_reply_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_visitor bytea := private.analytics_visitor(p_ip, p_user_agent);
  v_message text := btrim(coalesce(p_message, ''));
  v_page text := nullif(btrim(coalesce(p_page, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_reply_email, ''))), '');
  v_id uuid;
begin
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
  if v_email is not null and (char_length(v_email) > 254
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Enter a valid email address, or leave it empty';
  end if;
  -- Counted one at a time, so parallel requests cannot pass the limits: a few an hour from one
  -- visitor, and a cap for all visitors together, so a flood from many addresses stops too.
  perform pg_advisory_xact_lock(hashtextextended('submit_visitor_feedback', 0));
  if (select count(*) from public.feedback f
      where f.visitor = v_visitor and f.created_at > now() - interval '1 hour') >= 3
    or (select count(*) from public.feedback f
      where f.visitor = v_visitor and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have sent a lot of feedback. Try again later';
  end if;
  if (select count(*) from public.feedback f
      where f.visitor is not null and f.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'A lot of feedback came in just now. Try again later';
  end if;
  insert into public.feedback(visitor, kind, message, page, reply_email)
  values (v_visitor, p_kind, v_message, v_page, v_email)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.submit_visitor_feedback(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_visitor_feedback(text, text, text, text, text, text)
  to service_role;

-- 3. A visitor's feedback is alerted too. Its alert names no account, and says only whether the
-- visitor left an address for a reply, never the address.
alter table private.telegram_alerts
  alter column user_id drop not null,
  add constraint telegram_alerts_user check (user_id is not null or kind = 'feedback');

create or replace function private.telegram_alert_context(p_alert private.telegram_alerts)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user record;
  v_feedback public.feedback%rowtype;
  v_saas public.saas%rowtype;
  v_report public.reports%rowtype;
  v_message public.messages%rowtype;
  v_recipient uuid;
begin
  if p_alert.kind = 'feedback' then
    select * into v_feedback from public.feedback f where f.id = p_alert.feedback_id;
    if v_feedback.id is null then return null; end if;
    if v_feedback.user_id is null then
      return jsonb_build_object('visitor', true, 'reply', v_feedback.reply_email is not null,
        'feedback_kind', v_feedback.kind, 'message', v_feedback.message, 'page', v_feedback.page);
    end if;
  end if;
  select u.raw_app_meta_data ->> 'provider' as provider, u.email_confirmed_at is not null
      as confirmed, p.name, p.slug, p.suspended_at is not null as suspended
    into v_user
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_alert.user_id;
  if not found then return null; end if;
  if p_alert.kind = 'signup' then
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'provider', v_user.provider, 'confirmed', v_user.confirmed,
      'accounts', (select count(*) from auth.users));
  elsif p_alert.kind = 'feedback' then
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'feedback_kind', v_feedback.kind, 'message', v_feedback.message, 'page', v_feedback.page);
  elsif p_alert.kind = 'saas' then
    select * into v_saas from public.saas s where s.id = p_alert.saas_id;
    if v_saas.id is null then return null; end if;
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'product', v_saas.name, 'tagline', v_saas.tagline, 'category', v_saas.category,
      'slug', v_saas.slug, 'hidden', v_saas.hidden_at is not null);
  elsif p_alert.kind = 'report' then
    select * into v_report from public.reports r where r.id = p_alert.report_id;
    if v_report.id is null then return null; end if;
    -- The report's copy of a message stays in the admin panel.
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'report_id', v_report.id, 'target', v_report.target,
      'target_name', case when v_report.target = 'saas' then v_report.content ->> 'name' end,
      'subject_name', (select p.name from public.profiles p where p.id = v_report.subject_id),
      'reason', v_report.reason, 'details', v_report.details,
      'open_reports', (select count(*) from public.reports r where r.status = 'open'));
  elsif p_alert.kind = 'message' then
    select * into v_message from public.messages m where m.id = p_alert.message_id;
    if v_message.id is null then return null; end if;
    select case when c.user_a = v_message.sender_id then c.user_b else c.user_a end
      into v_recipient
    from public.conversations c where c.id = v_message.conversation_id;
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'sender_id', v_message.sender_id, 'sender_suspended', v_user.suspended,
      'wanted', exists (select 1 from private.telegram_inboxes i where i.user_id = v_recipient),
      'blocked', exists (
        select 1 from public.blocks b
        where (b.blocker_id = v_recipient and b.blocked_id = v_message.sender_id)
           or (b.blocker_id = v_message.sender_id and b.blocked_id = v_recipient)));
  end if;
  return null;
end;
$$;

-- 4. Visitor feedback, with any address left for a reply, is kept for 12 months. A user's goes with
-- their account.
select cron.schedule('harbor-feedback-retention', '37 3 * * *',
  $$ delete from public.feedback where user_id is null and created_at < now() - interval '12 months' $$);

-- Email notifications through an outbox. Database events queue emails in private.email_outbox; a
-- trusted server worker (service role) claims them, reads the recipient's address, sends through
-- SMTP and records the outcome. Makers never see anyone's email address, and message text never
-- leaves in an email.

-- 1. What each person wants. No row means the defaults: every notification on.
create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages boolean not null default true,
  reports boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;
grant select on public.notification_settings to authenticated;
create policy notification_settings_own_read on public.notification_settings for select
  to authenticated using (user_id = (select auth.uid()));

-- Saves the caller's settings. Invoker rights would need update rights on user_id for an upsert,
-- so this runs as the owner and only ever writes the caller's own row.
create function public.save_notification_settings(p_messages boolean, p_reports boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to change your settings' using errcode = '42501';
  end if;
  insert into public.notification_settings(user_id, messages, reports)
  values (v_user, coalesce(p_messages, true), coalesce(p_reports, true))
  on conflict (user_id) do update set messages = excluded.messages, reports = excluded.reports,
    updated_at = now();
end;
$$;
revoke execute on function public.save_notification_settings(boolean, boolean)
  from public, anon, service_role;
grant execute on function public.save_notification_settings(boolean, boolean) to authenticated;

create function private.wants_email(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_kind when 'message' then s.messages when 'reports' then s.reports else true end
    from public.notification_settings s where s.user_id = p_user
  ), true);
$$;
revoke execute on function private.wants_email(uuid, text) from public, anon, authenticated;

-- 2. The outbox. Kept a week after sending, which also limits repeat emails.
create table private.email_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message', 'reports', 'decision', 'outcome')),
  -- Emails with the same topic do not repeat, such as one per unread conversation.
  topic text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  send_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);
create index email_outbox_due_idx on private.email_outbox(send_after) where status = 'pending';
create index email_outbox_topic_idx on private.email_outbox(user_id, topic, created_at desc);
create index email_outbox_processed_idx on private.email_outbox(processed_at)
  where processed_at is not null;
alter table private.email_outbox enable row level security;
revoke all on private.email_outbox from public, anon, authenticated;

-- 3. What queues an email.

-- A new message: one email per conversation until the recipient reads it. The worker waits a few
-- minutes before sending, so makers who are online read it first and get no email.
create function private.queue_message_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_topic text := 'message:' || new.conversation_id;
  v_read timestamptz;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end into v_recipient
  from public.conversations c where c.id = new.conversation_id;
  if v_recipient is null or not private.wants_email(v_recipient, 'message') then return null; end if;
  -- Two messages at the same moment must not both queue an email.
  perform pg_advisory_xact_lock(hashtextextended(v_recipient::text || v_topic, 0));
  select r.read_at into v_read from public.conversation_reads r
  where r.conversation_id = new.conversation_id and r.user_id = v_recipient;
  if not exists (
    select 1 from private.email_outbox o
    where o.user_id = v_recipient and o.topic = v_topic
      and o.created_at > coalesce(v_read, '-infinity'::timestamptz)
  ) then
    insert into private.email_outbox(user_id, kind, topic, payload)
    values (v_recipient, 'message', v_topic, jsonb_build_object(
      'conversation_id', new.conversation_id, 'sender_id', new.sender_id));
  end if;
  return null;
end;
$$;
revoke execute on function private.queue_message_email() from public, anon, authenticated;
create trigger messages_email after insert on public.messages
  for each row execute function private.queue_message_email();

-- A new report: one waiting email per admin, and at most one an hour.
create function private.queue_report_emails() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid;
  v_last timestamptz;
begin
  for v_admin in select a.user_id from private.admins a loop
    continue when not private.wants_email(v_admin, 'reports');
    continue when exists (
      select 1 from private.email_outbox o
      where o.user_id = v_admin and o.topic = 'reports' and o.status = 'pending'
    );
    select max(o.processed_at) into v_last from private.email_outbox o
    where o.user_id = v_admin and o.topic = 'reports' and o.status = 'sent';
    insert into private.email_outbox(user_id, kind, topic, send_after)
    values (v_admin, 'reports', 'reports', greatest(now(), v_last + interval '1 hour'));
  end loop;
  return null;
end;
$$;
revoke execute on function private.queue_report_emails() from public, anon, authenticated;
create trigger reports_email after insert on public.reports
  for each row execute function private.queue_report_emails();

-- A decided report: the reporter learns the outcome.
create function private.queue_outcome_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    insert into private.email_outbox(user_id, kind, topic, payload)
    values (new.reporter_id, 'outcome', 'outcome:' || new.id,
      jsonb_build_object('report_id', new.id));
  end if;
  return null;
end;
$$;
revoke execute on function private.queue_outcome_email() from public, anon, authenticated;
create trigger reports_outcome_email after update of status on public.reports
  for each row execute function private.queue_outcome_email();

-- An admin decision about a product or account: the maker learns it, with the reason and the
-- explanation. Notes on reversals are for admins only and stay out of the email.
create function private.queue_decision_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.action in ('hide_saas', 'restore_saas', 'suspend_account', 'restore_account') then
    insert into private.email_outbox(user_id, kind, topic, payload)
    values (new.subject_id, 'decision', 'decision:' || new.id, jsonb_build_object(
      'action', new.action,
      'target_label', new.target_label,
      'reason', new.reason,
      'note', case when new.action in ('hide_saas', 'suspend_account') then new.note else '' end));
  end if;
  return null;
end;
$$;
revoke execute on function private.queue_decision_email() from public, anon, authenticated;
create trigger moderation_log_email after insert on public.moderation_log
  for each row execute function private.queue_decision_email();

-- 4. The worker's side, for service_role only.

-- What an email needs at the moment it is sent, so it reflects the current state: a message
-- email checks that the conversation is still unread and not blocked.
create function private.email_context(p_kind text, p_user uuid, p_payload jsonb,
  p_queued_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_conversation uuid;
  v_sender uuid;
  v_read timestamptz;
  v_report public.reports%rowtype;
begin
  if p_kind = 'message' then
    v_conversation := (p_payload ->> 'conversation_id')::uuid;
    v_sender := (p_payload ->> 'sender_id')::uuid;
    select r.read_at into v_read from public.conversation_reads r
    where r.conversation_id = v_conversation and r.user_id = p_user;
    return jsonb_build_object(
      'wanted', private.wants_email(p_user, 'message'),
      'sender_id', v_sender,
      'sender_name', (select p.name from public.profiles p where p.id = v_sender),
      'sender_suspended', exists (
        select 1 from public.profiles p where p.id = v_sender and p.suspended_at is not null),
      'blocked', exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_user and b.blocked_id = v_sender)
           or (b.blocker_id = v_sender and b.blocked_id = p_user)),
      -- Read since this email was queued: any later message queued an email of its own.
      'unread', case when v_read >= p_queued_at then 0 else (
        select count(*) from public.messages m
        where m.conversation_id = v_conversation and m.sender_id = v_sender
          and m.created_at > coalesce(v_read, '-infinity'::timestamptz)) end);
  elsif p_kind = 'reports' then
    return jsonb_build_object(
      'wanted', private.wants_email(p_user, 'reports')
        and exists (select 1 from private.admins a where a.user_id = p_user),
      'open', (select count(*) from public.reports r where r.status = 'open'));
  elsif p_kind = 'outcome' then
    select * into v_report from public.reports r where r.id = (p_payload ->> 'report_id')::uuid;
    if v_report.id is null then return null; end if;
    return jsonb_build_object('status', v_report.status, 'target', v_report.target,
      'name', v_report.content ->> 'name', 'reason', v_report.reason);
  end if;
  return p_payload;
end;
$$;
revoke execute on function private.email_context(text, uuid, jsonb, timestamptz)
  from public, anon, authenticated;

-- Claims due emails for two minutes, so parallel workers never send one twice. Message emails
-- wait p_message_delay seconds after they were queued. The worker runs every minute, so this is
-- also where processed emails are deleted after a week.
create function public.claim_emails(p_limit integer, p_message_delay integer)
returns table (id bigint, kind text, email text, name text, context jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  -- The moment of claiming, not of the transaction's start: emails queued since then are due too.
  v_now timestamptz := clock_timestamp();
begin
  delete from private.email_outbox o where o.processed_at < v_now - interval '7 days';
  return query
  with due as (
    select o.id from private.email_outbox o
    where o.status = 'pending' and o.send_after <= v_now
      and (o.locked_until is null or o.locked_until < v_now)
      and (o.kind <> 'message'
        or o.created_at <= v_now - make_interval(secs => greatest(p_message_delay, 0)))
    order by o.send_after, o.id
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  ), claimed as (
    update private.email_outbox o
    set locked_until = v_now + interval '2 minutes', attempts = o.attempts + 1
    from due where o.id = due.id
    returning o.id, o.kind, o.user_id, o.payload, o.created_at
  )
  select c.id, c.kind, u.email::text, p.name,
    private.email_context(c.kind, c.user_id, c.payload, c.created_at)
  from claimed c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id;
end;
$$;

-- Records what happened to a claimed email. A failed email is tried again later, five times in all.
create function public.complete_email(p_id bigint, p_status text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'Unknown email status %', p_status;
  end if;
  update private.email_outbox o set
    status = case when p_status = 'failed' and o.attempts < 5 then 'pending' else p_status end,
    processed_at = case when p_status = 'failed' and o.attempts < 5 then null else v_now end,
    send_after = case when p_status = 'failed' then v_now + make_interval(mins => 5 * o.attempts)
      else o.send_after end,
    locked_until = null,
    last_error = case when p_status = 'sent' then null else left(p_error, 300) end
  where o.id = p_id;
end;
$$;

revoke execute on function public.claim_emails(integer, integer), public.complete_email(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_emails(integer, integer), public.complete_email(bigint, text, text)
  to service_role;

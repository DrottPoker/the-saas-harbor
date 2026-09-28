-- More Telegram alerts (migration 20260928110000): new products, new reports, and messages to the
-- accounts the owner chooses, such as their own. Message alerts name the sender and never carry
-- the message, like the notification emails.

-- 1. The accounts whose incoming messages are alerted, set in the SQL editor with
-- set_telegram_inbox(), like admin rights. They go with the account.
create table private.telegram_inboxes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.telegram_inboxes enable row level security;
revoke all on private.telegram_inboxes from public, anon, authenticated;

-- Turns alerts about messages to an account on or off, by its username (with or without @).
create function public.set_telegram_inbox(p_username text, p_on boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select p.id into v_user from public.profiles p
  where p.slug = ltrim(lower(btrim(p_username)), '@');
  if v_user is null then
    raise exception 'No profile has this username' using errcode = 'P0002';
  end if;
  if p_on then
    insert into private.telegram_inboxes(user_id) values (v_user) on conflict (user_id) do nothing;
  else
    delete from private.telegram_inboxes where user_id = v_user;
  end if;
  return v_user;
end;
$$;
revoke execute on function public.set_telegram_inbox(text, boolean) from public, anon, authenticated;
grant execute on function public.set_telegram_inbox(text, boolean) to service_role;

-- 2. The new kinds, each with its subject. user_id is the product's founder, the reporter or the
-- sender.
alter table private.telegram_alerts
  drop constraint telegram_alerts_kind_check,
  drop constraint telegram_alerts_subject,
  add column saas_id uuid references public.saas(id) on delete cascade,
  add column report_id uuid references public.reports(id) on delete cascade,
  add column message_id uuid references public.messages(id) on delete cascade,
  add constraint telegram_alerts_kind_check
    check (kind in ('signup', 'feedback', 'saas', 'report', 'message')),
  add constraint telegram_alerts_subject check (
    (kind = 'feedback') = (feedback_id is not null)
    and (kind = 'saas') = (saas_id is not null)
    and (kind = 'report') = (report_id is not null)
    and (kind = 'message') = (message_id is not null));
create index telegram_alerts_saas_idx on private.telegram_alerts(saas_id);
create index telegram_alerts_report_idx on private.telegram_alerts(report_id);
create index telegram_alerts_message_idx on private.telegram_alerts(message_id);

-- 3. What queues them.
create function private.queue_saas_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.telegram_alerts(kind, user_id, saas_id) values ('saas', new.owner_id, new.id);
  return null;
end;
$$;
revoke execute on function private.queue_saas_alert() from public, anon, authenticated;
create trigger saas_telegram_alert after insert on public.saas
  for each row execute function private.queue_saas_alert();

create function private.queue_report_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.telegram_alerts(kind, user_id, report_id)
  values ('report', new.reporter_id, new.id);
  return null;
end;
$$;
revoke execute on function private.queue_report_alert() from public, anon, authenticated;
create trigger reports_telegram_alert after insert on public.reports
  for each row execute function private.queue_report_alert();

-- A message to a chosen account: one alert per conversation until that account reads it, as the
-- message emails do.
create function private.queue_message_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_read timestamptz;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end into v_recipient
  from public.conversations c where c.id = new.conversation_id;
  if v_recipient is null
    or not exists (select 1 from private.telegram_inboxes i where i.user_id = v_recipient) then
    return null;
  end if;
  -- Two messages at the same moment must not both queue an alert.
  perform pg_advisory_xact_lock(hashtextextended('telegram:' || new.conversation_id::text, 0));
  select r.read_at into v_read from public.conversation_reads r
  where r.conversation_id = new.conversation_id and r.user_id = v_recipient;
  if not exists (
    select 1 from private.telegram_alerts a join public.messages m on m.id = a.message_id
    where a.kind = 'message' and m.conversation_id = new.conversation_id
      and a.created_at > coalesce(v_read, '-infinity'::timestamptz)
  ) then
    insert into private.telegram_alerts(kind, user_id, message_id)
    values ('message', new.sender_id, new.id);
  end if;
  return null;
end;
$$;
revoke execute on function private.queue_message_alert() from public, anon, authenticated;
create trigger messages_telegram_alert after insert on public.messages
  for each row execute function private.queue_message_alert();

-- 4. What an alert says, read when it is sent. Never an email address or a message.
drop function private.telegram_alert_context(text, uuid, uuid);
create function private.telegram_alert_context(p_alert private.telegram_alerts)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user record;
  v_feedback public.feedback%rowtype;
  v_saas public.saas%rowtype;
  v_report public.reports%rowtype;
  v_message public.messages%rowtype;
  v_recipient uuid;
begin
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
    select * into v_feedback from public.feedback f where f.id = p_alert.feedback_id;
    if v_feedback.id is null then return null; end if;
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
revoke execute on function private.telegram_alert_context(private.telegram_alerts)
  from public, anon, authenticated;

-- Unchanged but for passing the whole alert.
create or replace function public.claim_telegram_alerts(p_limit integer)
returns table (id bigint, kind text, user_id uuid, feedback_id uuid, context jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  delete from private.telegram_alerts a where a.processed_at < v_now - interval '7 days';
  update private.telegram_alerts a
  set status = 'skipped', processed_at = v_now, locked_until = null, last_error = 'Too old to send'
  where a.status = 'pending' and a.created_at < v_now - interval '1 day';
  return query
  with due as (
    select a.id from private.telegram_alerts a
    where a.status = 'pending' and a.send_after <= v_now
      and (a.locked_until is null or a.locked_until < v_now)
    order by a.send_after, a.id
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  ), claimed as (
    update private.telegram_alerts a
    set locked_until = v_now + interval '2 minutes', attempts = a.attempts + 1
    from due where a.id = due.id
    returning a as alert
  )
  select (c.alert).id, (c.alert).kind, (c.alert).user_id, (c.alert).feedback_id,
    private.telegram_alert_context(c.alert)
  from claimed c
  order by (c.alert).id;
end;
$$;

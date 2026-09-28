-- Alerts to the owner's Telegram chat about new accounts and new feedback, through an outbox like
-- the notification emails (migration 20260925170000). Triggers queue an alert in the same
-- transaction as what it is about; a trusted server worker (service role) claims it, reads what it
-- needs at that moment and sends it through the Telegram Bot API. A row holds only ids, and goes
-- with the account and with the feedback.
create table private.telegram_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('signup', 'feedback')),
  -- The new account, or the sender of the feedback.
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_id uuid references public.feedback(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  send_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  constraint telegram_alerts_subject check ((kind = 'feedback') = (feedback_id is not null))
);
create index telegram_alerts_due_idx on private.telegram_alerts(send_after) where status = 'pending';
create index telegram_alerts_created_idx on private.telegram_alerts(created_at);
create index telegram_alerts_feedback_idx on private.telegram_alerts(feedback_id);
-- One alert per new account.
create unique index telegram_alerts_signup_idx on private.telegram_alerts(user_id)
  where kind = 'signup';
alter table private.telegram_alerts enable row level security;
revoke all on private.telegram_alerts from public, anon, authenticated;

-- A new account: queued when its profile is created, at sign-up with a username or when a Google
-- or GitHub sign-up is finished, so the alert can name the user. Older accounts that get their
-- first profile later, such as when they save a product, are not new.
create function private.queue_signup_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users u
    where u.id = new.id and u.created_at > now() - interval '1 day') then
    insert into private.telegram_alerts(kind, user_id) values ('signup', new.id)
    on conflict (user_id) where kind = 'signup' do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function private.queue_signup_alert() from public, anon, authenticated;
create trigger profiles_telegram_alert after insert on public.profiles
  for each row execute function private.queue_signup_alert();

create function private.queue_feedback_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.telegram_alerts(kind, user_id, feedback_id)
  values ('feedback', new.user_id, new.id);
  return null;
end;
$$;
revoke execute on function private.queue_feedback_alert() from public, anon, authenticated;
create trigger feedback_telegram_alert after insert on public.feedback
  for each row execute function private.queue_feedback_alert();

-- What an alert says, read when it is sent: the user's name and username, and for a new account
-- how it signed up, whether the email address is confirmed and the number of accounts; for
-- feedback its kind, text and page. Never the email address.
create function private.telegram_alert_context(p_kind text, p_user uuid, p_feedback uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user record;
  v_feedback public.feedback%rowtype;
begin
  select u.raw_app_meta_data ->> 'provider' as provider, u.email_confirmed_at is not null
      as confirmed, p.name, p.slug
    into v_user
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user;
  if not found then return null; end if;
  if p_kind = 'signup' then
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'provider', v_user.provider, 'confirmed', v_user.confirmed,
      'accounts', (select count(*) from auth.users));
  elsif p_kind = 'feedback' then
    select * into v_feedback from public.feedback f where f.id = p_feedback;
    if v_feedback.id is null then return null; end if;
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'feedback_kind', v_feedback.kind, 'message', v_feedback.message, 'page', v_feedback.page);
  end if;
  return null;
end;
$$;
revoke execute on function private.telegram_alert_context(text, uuid, uuid)
  from public, anon, authenticated;

-- Claims due alerts for two minutes, so parallel workers never send one twice. Alerts that waited
-- a day, such as while Telegram was not configured, are skipped rather than sent late, and
-- processed alerts are deleted after a week.
create function public.claim_telegram_alerts(p_limit integer)
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
    returning a.id, a.kind, a.user_id, a.feedback_id
  )
  select c.id, c.kind, c.user_id, c.feedback_id,
    private.telegram_alert_context(c.kind, c.user_id, c.feedback_id)
  from claimed c
  order by c.id;
end;
$$;

-- Records what happened to a claimed alert. A failed alert is tried again later, five times in
-- all; p_retry_after (seconds, from Telegram's rate limit) sets the earliest next try.
create function public.complete_telegram_alert(p_id bigint, p_status text, p_error text,
  p_retry_after integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'Unknown alert status %', p_status;
  end if;
  update private.telegram_alerts a set
    status = case when p_status = 'failed' and a.attempts < 5 then 'pending' else p_status end,
    processed_at = case when p_status = 'failed' and a.attempts < 5 then null else v_now end,
    send_after = case when p_status = 'failed' then v_now + greatest(
        make_interval(mins => a.attempts), make_interval(secs => coalesce(p_retry_after, 0)))
      else a.send_after end,
    locked_until = null,
    last_error = case when p_status = 'sent' then null else left(p_error, 300) end
  where a.id = p_id;
end;
$$;

revoke execute on function public.claim_telegram_alerts(integer),
  public.complete_telegram_alert(bigint, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_alerts(integer),
  public.complete_telegram_alert(bigint, text, text, integer) to service_role;

-- Alerts every minute, for any that were not sent right after the action. A run claims nothing
-- new after 30 seconds, and its last request may take ten more.
select cron.schedule('harbor-telegram-send', '* * * * *',
  $$ select private.run_scheduled_job('/api/telegram/send', 60000) $$);

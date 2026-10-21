-- The email and Telegram jobs called the app every minute whether or not anything was due: about
-- 86,000 requests a month that mostly found nothing, against the host's monthly CPU allowance (the
-- usage review of 2026-10-21). The database now calls a send route only while something there
-- is due. Actions still send what they queue right after responding, so the jobs mostly pick up
-- message emails and retries. Message emails also wait a few minutes in the app, so a run may
-- find one too early and leave it for the next minute.

create function private.emails_due() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from private.email_outbox o
    where o.status = 'pending' and o.send_after <= now()
      and (o.locked_until is null or o.locked_until < now())
  );
$$;
revoke execute on function private.emails_due() from public, anon, authenticated, service_role;

create function private.telegram_alerts_due() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from private.telegram_alerts a
    where a.status = 'pending' and a.send_after <= now()
      and (a.locked_until is null or a.locked_until < now())
  );
$$;
revoke execute on function private.telegram_alerts_due()
  from public, anon, authenticated, service_role;

select cron.schedule('harbor-email-send', '* * * * *',
  $$ select private.run_scheduled_job('/api/email/send', 60000) where private.emails_due() $$);
select cron.schedule('harbor-telegram-send', '* * * * *',
  $$ select private.run_scheduled_job('/api/telegram/send', 60000)
     where private.telegram_alerts_due() $$);

-- Handled emails were deleted only when a run claimed one to send, so with the job now quiet they
-- would stay past their week. A daily job deletes them, as it does for Telegram alerts.
create function private.prune_email_outbox() returns void
language sql set search_path = '' as $$
  delete from private.email_outbox where processed_at < now() - interval '7 days';
$$;
revoke execute on function private.prune_email_outbox()
  from public, anon, authenticated, service_role;

select cron.schedule('harbor-email-retention', '33 3 * * *',
  $$ select private.prune_email_outbox() $$);

-- Telegram alerts were pruned only when the worker claimed one to send, which never happens while
-- Telegram is not set up, so alerts naming accounts piled up for good (the project review of
-- 2026-10-01). A daily job now applies the same limits whether or not anything is sent: an alert
-- still waiting after a day is given up, and one handled more than seven days ago is deleted.
create function private.prune_telegram_alerts() returns void
language sql set search_path = '' as $$
  update private.telegram_alerts
  set status = 'skipped', processed_at = now(), locked_until = null, last_error = 'Too old to send'
  where status = 'pending' and created_at < now() - interval '1 day';
  delete from private.telegram_alerts where processed_at < now() - interval '7 days';
$$;
revoke execute on function private.prune_telegram_alerts()
  from public, anon, authenticated, service_role;

select cron.schedule('harbor-telegram-retention', '29 3 * * *',
  $$ select private.prune_telegram_alerts() $$);

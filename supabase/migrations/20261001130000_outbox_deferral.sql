-- An email or Telegram alert that could not be sent because the service was unreachable, refused
-- the site's credentials or asked to slow down is put back without counting an attempt (review of
-- 2026-10-01). Before, every claim counted, so an SMTP outage of about 50 minutes, or a revoked
-- key, used up all five attempts of every email queued meanwhile, decisions included, and a
-- Telegram outage of a few minutes did the same to alerts. The worker reports such a failure as
-- 'deferred' and stops its run; failures that belong to one email or alert still count.

create or replace function public.complete_email(p_id bigint, p_status text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('sent', 'skipped', 'failed', 'deferred') then
    raise exception 'Unknown email status %', p_status;
  end if;
  if p_status = 'deferred' then
    update private.email_outbox o set attempts = greatest(o.attempts - 1, 0),
      send_after = v_now + interval '5 minutes', locked_until = null,
      last_error = left(p_error, 300)
    where o.id = p_id;
    return;
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

create or replace function public.complete_telegram_alert(p_id bigint, p_status text,
  p_error text, p_retry_after integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('sent', 'skipped', 'failed', 'deferred') then
    raise exception 'Unknown alert status %', p_status;
  end if;
  if p_status = 'deferred' then
    update private.telegram_alerts a set attempts = greatest(a.attempts - 1, 0),
      send_after = v_now + greatest(interval '1 minute',
        make_interval(secs => coalesce(p_retry_after, 0))),
      locked_until = null, last_error = left(p_error, 300)
    where a.id = p_id;
    return;
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

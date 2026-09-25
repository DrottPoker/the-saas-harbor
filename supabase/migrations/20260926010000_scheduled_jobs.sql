-- Scheduled jobs run in the database, so they do not depend on the host's scheduler: pg_cron calls
-- the app's two job routes over HTTPS through pg_net, with the bearer secret. Where to call and the
-- secret live in Vault and are set only in production (see README); without them a run does
-- nothing, so local stacks and CI never call anything.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Queues a POST to the app and returns the pg_net request id, or null when Vault has no settings.
create function private.run_scheduled_job(p_path text, p_timeout_ms integer) returns bigint
language plpgsql set search_path = '' as $$
declare
  v_site text;
  v_secret text;
begin
  select decrypted_secret into v_site from vault.decrypted_secrets where name = 'harbor_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where name = 'harbor_cron_secret';
  if v_site is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_site, '/') || p_path,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'),
    timeout_milliseconds := p_timeout_ms
  );
end;
$$;
revoke execute on function private.run_scheduled_job(text, integer)
  from public, anon, authenticated, service_role;

-- Notification emails every minute. A revenue sync claims nothing new after four minutes and may
-- run for five, so its request waits a little longer. Run history is kept for a week.
select cron.schedule('harbor-email-send', '* * * * *',
  $$ select private.run_scheduled_job('/api/email/send', 60000) $$);
select cron.schedule('harbor-revenue-sync', '*/10 * * * *',
  $$ select private.run_scheduled_job('/api/revenue/sync', 310000) $$);
select cron.schedule('harbor-job-history', '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$);

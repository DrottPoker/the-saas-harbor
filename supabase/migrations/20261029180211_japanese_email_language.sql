-- Japanese is a supported notification-email language; absent or invalid values stay English.
create or replace function public.claim_emails(p_limit integer, p_message_delay integer)
returns table (id bigint, kind text, email text, name text, context jsonb, locale text)
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
    private.email_context(c.kind, c.user_id, c.payload, c.created_at),
    case when u.raw_user_meta_data ->> 'locale' in ('en', 'zh', 'hi', 'ar', 'es', 'ru', 'ja')
      then u.raw_user_meta_data ->> 'locale' else 'en' end
  from claimed c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id;
end;
$$;

revoke execute on function public.claim_emails(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_emails(integer, integer) to service_role;

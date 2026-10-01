-- A message to a chosen account is alerted again once that account has read the conversation
-- (review of 2026-10-01). The check compared the alert's own time, taken when the trigger ran, with
-- the read position, which is the newest message's time. The alert is always a moment later than
-- its message, so after reading exactly the alerted message the next message counted as alerted
-- already, and every second message after a read went without an alert. The check now compares
-- the alerted message's time, as the message emails do.
create or replace function private.queue_message_alert() returns trigger
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
      and m.created_at > coalesce(v_read, '-infinity'::timestamptz)
  ) then
    insert into private.telegram_alerts(kind, user_id, message_id)
    values ('message', new.sender_id, new.id);
  end if;
  return null;
end;
$$;

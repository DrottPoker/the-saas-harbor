-- Read receipts, at the owner's request: each participant sees how far the other has read their
-- conversation, so the sender's newest message says Seen once the recipient has opened it. Nobody
-- else sees it. Read positions are now written only by mark_conversation_read() and
-- send_message(), so a maker cannot set theirs ahead of what they read or move it back.

-- 1. Both participants read the conversation's read positions, and neither writes them directly.
drop policy reads_own_read on public.conversation_reads;
drop policy reads_own_insert on public.conversation_reads;
drop policy reads_own_update on public.conversation_reads;
-- Also revokes the column privilege on read_at.
revoke insert, update on public.conversation_reads from authenticated;
create policy reads_participant_read on public.conversation_reads for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.user_a, c.user_b)
  ));

-- 2. Moves the signed-in maker's read position forward, never past the newest message, and tells
-- the other participant on their private channel `user:<id>`. The event carries the conversation
-- id and the position only. SECURITY DEFINER because makers cannot write read positions or send
-- Realtime events; the reader is always auth.uid().
create or replace function public.mark_conversation_read(p_conversation uuid, p_read_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_reader uuid := auth.uid();
  v_other uuid;
  v_read_at timestamptz;
begin
  select case when c.user_a = v_reader then c.user_b else c.user_a end into v_other
  from public.conversations c
  where c.id = p_conversation and v_reader in (c.user_a, c.user_b);
  if v_other is null then return; end if;
  select least(p_read_at, max(m.created_at)) into v_read_at
  from public.messages m where m.conversation_id = p_conversation;
  if v_read_at is null then return; end if;
  insert into public.conversation_reads(conversation_id, user_id, read_at)
  values (p_conversation, v_reader, v_read_at)
  on conflict on constraint conversation_reads_pkey
  do update set read_at = excluded.read_at
  where public.conversation_reads.read_at < excluded.read_at;
  -- Only a position that moved is announced.
  if found then
    perform realtime.send(
      jsonb_build_object('conversation_id', p_conversation, 'read_at', v_read_at),
      'read', 'user:' || v_other::text, true);
  end if;
end;
$$;
revoke execute on function public.mark_conversation_read(uuid, timestamptz)
  from public, anon, service_role;
grant execute on function public.mark_conversation_read(uuid, timestamptz) to authenticated;

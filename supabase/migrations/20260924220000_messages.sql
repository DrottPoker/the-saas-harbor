-- Private messages between makers. Two makers share one conversation, and only they can read it.
-- Messages are written only through send_message(), which checks blocks and rate limits. New
-- messages are announced on a private Realtime channel per user with ids only, never the text;
-- clients then read the message under RLS. Everything references profiles, so deleting either
-- account deletes the whole conversation.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The participants in a fixed order, so a pair of makers has exactly one conversation.
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  started_by uuid not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_ordered check (user_a < user_b),
  constraint conversations_starter check (started_by in (user_a, user_b)),
  constraint conversations_pair unique (user_a, user_b)
);
create index conversations_user_b_idx on public.conversations(user_b);
create index conversations_started_idx on public.conversations(started_by, created_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000 and btrim(body) <> ''),
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages(sender_id, created_at);

-- How far each participant has read, for unread counts. The other participant never sees it.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null,
  primary key (conversation_id, user_id)
);
create index conversation_reads_user_idx on public.conversation_reads(user_id);

-- A block stops messages in both directions. Only the maker who blocked can see it.
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_other check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.blocks enable row level security;
revoke all on public.conversations, public.messages, public.conversation_reads, public.blocks
  from anon, authenticated;

grant select on public.conversations, public.messages to authenticated;
create policy conversations_participant_read on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy messages_participant_read on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.user_a, c.user_b)
  ));

grant select, insert, update (read_at) on public.conversation_reads to authenticated;
create policy reads_own_read on public.conversation_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy reads_own_insert on public.conversation_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.user_a, c.user_b)
  ));
create policy reads_own_update on public.conversation_reads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, delete on public.blocks to authenticated;
create policy blocks_own_read on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_own_insert on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy blocks_own_delete on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- One row per conversation of the signed-in maker: the other maker, the latest message and
-- how many messages from the other maker are unread.
create view public.inbox with (security_invoker = true) as
select c.id, o.id as other_id, o.name as other_name, o.avatar_path as other_avatar_path,
  c.last_message_at, m.body as last_body, m.sender_id as last_sender_id,
  (
    select count(*) from public.messages u
    where u.conversation_id = c.id and u.sender_id <> (select auth.uid())
      and u.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
  )::integer as unread,
  exists (
    select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = o.id
  ) as blocked
from public.conversations c
join public.profiles o
  on o.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
left join public.conversation_reads r
  on r.conversation_id = c.id and r.user_id = (select auth.uid())
left join lateral (
  select body, sender_id from public.messages
  where conversation_id = c.id order by created_at desc, id desc limit 1
) m on true
where (select auth.uid()) in (c.user_a, c.user_b);
grant select on public.inbox to authenticated;

create function public.unread_message_count() returns integer
language sql stable security invoker set search_path = '' as $$
  select count(*)::integer
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.conversation_reads r
    on r.conversation_id = c.id and r.user_id = (select auth.uid())
  where (select auth.uid()) in (c.user_a, c.user_b)
    and m.sender_id <> (select auth.uid())
    and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz);
$$;
revoke execute on function public.unread_message_count() from public, anon;
grant execute on function public.unread_message_count() to authenticated;

-- Moves the signed-in maker's read position forward, never past the current time.
create function public.mark_conversation_read(p_conversation uuid, p_read_at timestamptz)
returns void language sql security invoker set search_path = '' as $$
  insert into public.conversation_reads(conversation_id, user_id, read_at)
  select c.id, (select auth.uid()), least(p_read_at, clock_timestamp())
  from public.conversations c where c.id = p_conversation
  on conflict on constraint conversation_reads_pkey
  do update set read_at = greatest(public.conversation_reads.read_at, excluded.read_at);
$$;
revoke execute on function public.mark_conversation_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_conversation_read(uuid, timestamptz) to authenticated;

-- The only way to write a message. SECURITY DEFINER because makers cannot write these tables;
-- the sender is always auth.uid(). User-facing errors use the default SQLSTATE P0001.
create function public.send_message(p_recipient uuid, p_body text) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  v_sender uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_a uuid := least(v_sender, p_recipient);
  v_b uuid := greatest(v_sender, p_recipient);
  v_conversation uuid;
  v_message public.messages%rowtype;
begin
  if v_sender is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if p_recipient is null or p_recipient = v_sender then
    raise exception 'Choose another maker to message';
  end if;
  if v_body = '' then
    raise exception 'Write a message first';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Messages can be up to 4,000 characters';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_sender) then
    raise exception 'Set up your maker profile before sending messages';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_recipient) then
    raise exception 'This maker no longer has an account';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_recipient and b.blocked_id = v_sender)
       or (b.blocker_id = v_sender and b.blocked_id = p_recipient)
  ) then
    raise exception 'Messages between you and this maker are blocked';
  end if;
  -- Limits that stop one account from flooding others.
  if (select count(*) from public.messages m
      where m.sender_id = v_sender and m.created_at > now() - interval '1 minute') >= 20
    or (select count(*) from public.messages m
      where m.sender_id = v_sender and m.created_at > now() - interval '1 day') >= 500 then
    raise exception 'You are sending messages too quickly. Try again later';
  end if;
  select c.id into v_conversation from public.conversations c
  where c.user_a = v_a and c.user_b = v_b;
  if v_conversation is null then
    if (select count(*) from public.conversations c
        where c.started_by = v_sender and c.created_at > now() - interval '1 day') >= 20 then
      raise exception 'You have started many conversations today. Try again tomorrow';
    end if;
    insert into public.conversations(user_a, user_b, started_by) values (v_a, v_b, v_sender)
    on conflict on constraint conversations_pair do nothing
    returning id into v_conversation;
    -- Both makers may start the conversation at the same moment.
    if v_conversation is null then
      select c.id into v_conversation from public.conversations c
      where c.user_a = v_a and c.user_b = v_b;
    end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body)
  values (v_conversation, v_sender, v_body)
  returning * into v_message;
  update public.conversations set last_message_at = v_message.created_at
  where id = v_conversation;
  insert into public.conversation_reads(conversation_id, user_id, read_at)
  values (v_conversation, v_sender, v_message.created_at)
  on conflict on constraint conversation_reads_pkey
  do update set read_at = greatest(public.conversation_reads.read_at, excluded.read_at);
  return v_message;
end;
$$;
revoke execute on function public.send_message(uuid, text) from public, anon, service_role;
grant execute on function public.send_message(uuid, text) to authenticated;

-- Realtime: each new message is announced to both participants on their private channel
-- `user:<id>`, with ids only. Makers can join only their own channel.
create function private.announce_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_event jsonb := jsonb_build_object('id', new.id, 'conversation_id', new.conversation_id,
    'sender_id', new.sender_id, 'created_at', new.created_at);
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end into v_recipient
  from public.conversations c where c.id = new.conversation_id;
  perform realtime.send(v_event, 'message', 'user:' || v_recipient::text, true);
  perform realtime.send(v_event, 'message', 'user:' || new.sender_id::text, true);
  return null;
end;
$$;
revoke execute on function private.announce_message() from public, anon, authenticated;
create trigger messages_announce after insert on public.messages
  for each row execute function private.announce_message();

create policy "Makers receive broadcasts on their own channel" on realtime.messages
  for select to authenticated
  using (extension = 'broadcast' and (select realtime.topic()) = 'user:' || (select auth.uid())::text);

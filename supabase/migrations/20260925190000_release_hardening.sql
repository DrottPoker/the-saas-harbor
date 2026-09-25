-- Hardening from the security review before the first release.

-- 1. Slugs. A listed product's slug always wins over an earlier slug of another product, and a
-- product keeps only its five latest earlier slugs, so renames cannot reserve names for later.
create or replace function private.assign_slug(p_kind text, p_id uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_base text := private.slugify(p_name);
  v_slug text;
  v_n integer := 1;
begin
  if v_base = '' then
    v_base := case p_kind when 'saas' then 'product' else 'maker' end || '-' || left(p_id::text, 8);
  end if;
  -- Two saves of the same name wait for each other, so they cannot pick the same slug.
  perform pg_advisory_xact_lock(hashtextextended('slug:' || p_kind || ':' || v_base, 0));
  v_slug := v_base;
  while case p_kind
    when 'saas' then exists (select 1 from public.saas s where s.slug = v_slug and s.id <> p_id)
    else exists (select 1 from public.profiles p where p.slug = v_slug and p.id <> p_id)
  end loop
    v_n := v_n + 1;
    v_slug := rtrim(left(v_base, 55), '-') || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

create or replace function private.saas_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.slug := private.assign_slug('saas', new.id, new.name);
  elsif private.slugify(new.name) is distinct from private.slugify(old.name) then
    new.slug := private.assign_slug('saas', new.id, new.name);
    if new.slug <> old.slug then
      insert into private.saas_slug_redirects(slug, saas_id, created_at)
      values (old.slug, new.id, clock_timestamp())
      on conflict (slug) do update set saas_id = excluded.saas_id, created_at = excluded.created_at;
      delete from private.saas_slug_redirects r
      where r.saas_id = new.id and r.slug not in (
        select k.slug from private.saas_slug_redirects k where k.saas_id = new.id
        order by k.created_at desc, k.slug limit 5);
    end if;
  end if;
  -- A slug in use no longer redirects anywhere.
  if tg_op = 'INSERT' or new.slug is distinct from old.slug then
    delete from private.saas_slug_redirects where slug = new.slug;
  end if;
  return new;
end;
$$;
delete from private.saas_slug_redirects r
where r.slug not in (
  select k.slug from (
    select k.slug, row_number() over (partition by k.saas_id order by k.created_at desc, k.slug) n
    from private.saas_slug_redirects k
  ) k where k.n <= 5);

-- 2. Product additions are counted in their own log, which deleting a product does not shorten,
-- so "5 a day" holds however products are added and removed. It goes with the account.
create table private.saas_additions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
create index saas_additions_owner_idx on private.saas_additions(owner_id, added_at);
alter table private.saas_additions enable row level security;
revoke all on private.saas_additions from public, anon, authenticated;
insert into private.saas_additions(owner_id, added_at)
select s.owner_id, s.created_at from public.saas s where s.created_at > now() - interval '1 day';

create or replace function private.limit_saas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Concurrent inserts by the same maker wait for each other, so both limits hold exactly.
  perform pg_advisory_xact_lock(hashtextextended('saas_limit:' || new.owner_id::text, 0));
  if (select count(*) from public.saas s where s.owner_id = new.owner_id) > 20 then
    raise exception 'An account can list up to 20 products';
  end if;
  delete from private.saas_additions a
  where a.owner_id = new.owner_id and a.added_at <= now() - interval '1 day';
  if (select count(*) from private.saas_additions a where a.owner_id = new.owner_id) >= 5 then
    raise exception 'You can add up to 5 products a day. Try again tomorrow';
  end if;
  insert into private.saas_additions(owner_id) values (new.owner_id);
  return null;
end;
$$;

-- 3. Rate limits hold under parallel requests, and a suspension is not revealed to senders.
create or replace function public.send_message(p_recipient uuid, p_body text) returns public.messages
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
  if exists (select 1 from public.profiles p where p.id = v_sender and p.suspended_at is not null) then
    raise exception 'Your account is suspended, so you cannot send messages';
  end if;
  -- One answer for a deleted and a suspended account, so it does not reveal a suspension.
  if not exists (
    select 1 from public.profiles p where p.id = p_recipient and p.suspended_at is null
  ) then
    raise exception 'This maker cannot receive messages';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_recipient and b.blocked_id = v_sender)
       or (b.blocker_id = v_sender and b.blocked_id = p_recipient)
  ) then
    raise exception 'Messages between you and this maker are blocked';
  end if;
  -- Limits that stop one account from flooding others. A sender's messages are counted one at a
  -- time, so parallel requests cannot all pass the same count.
  perform pg_advisory_xact_lock(hashtextextended('send_message:' || v_sender::text, 0));
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

create or replace function public.submit_report(p_target text, p_id uuid, p_reason text, p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_reporter uuid := auth.uid();
  v_details text := btrim(coalesce(p_details, ''));
  v_subject uuid;
  v_saas uuid;
  v_message uuid;
  v_content jsonb;
  v_id uuid;
begin
  if v_reporter is null then
    raise exception 'Sign in to report something' using errcode = '42501';
  end if;
  if p_reason is null
    or p_reason not in ('spam', 'misleading', 'impersonation', 'harassment', 'illegal', 'other') then
    raise exception 'Choose a reason';
  end if;
  if char_length(v_details) > 1000 then
    raise exception 'Keep the details under 1,000 characters';
  end if;
  if p_reason in ('illegal', 'other') and v_details = '' then
    raise exception 'Describe the problem so it can be reviewed';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_reporter and p.suspended_at is not null) then
    raise exception 'Your account is suspended, so you cannot send reports';
  end if;
  -- A reporter's reports are counted one at a time, so parallel requests cannot pass the limit.
  perform pg_advisory_xact_lock(hashtextextended('submit_report:' || v_reporter::text, 0));
  if (select count(*) from public.reports r
      where r.reporter_id = v_reporter and r.created_at > now() - interval '1 hour') >= 10
    or (select count(*) from public.reports r
      where r.reporter_id = v_reporter and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have sent many reports. Try again later';
  end if;

  if p_target = 'saas' then
    select s.owner_id, s.id, jsonb_build_object('name', s.name, 'tagline', s.tagline,
        'description', s.description, 'category', s.category, 'website', s.website,
        'logo_path', s.logo_path)
      into v_subject, v_saas, v_content
    from public.saas s join public.profiles p on p.id = s.owner_id
    where s.id = p_id and s.hidden_at is null and p.suspended_at is null;
    if v_subject is null then raise exception 'This product could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report your own product'; end if;
  elsif p_target = 'profile' then
    select p.id, jsonb_build_object('name', p.name, 'headline', p.headline,
        'location', p.location, 'bio', p.bio, 'website', p.website,
        'linkedin_url', p.linkedin_url, 'github_url', p.github_url, 'x_url', p.x_url,
        'social_url', p.social_url, 'skills', to_jsonb(p.skills), 'avatar_path', p.avatar_path)
      into v_subject, v_content
    from public.profiles p where p.id = p_id and p.suspended_at is null;
    if v_subject is null then raise exception 'This maker could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report yourself'; end if;
  elsif p_target = 'message' then
    -- The participant check: only the two makers in the conversation can report its messages.
    select m.sender_id, m.id, jsonb_build_object('body', m.body, 'sent_at', m.created_at)
      into v_subject, v_message, v_content
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = p_id and v_reporter in (c.user_a, c.user_b);
    if v_subject is null then raise exception 'This message could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report your own message'; end if;
  else
    raise exception 'Choose what to report';
  end if;

  begin
    insert into public.reports(reporter_id, subject_id, target, saas_id, message_id, reason,
      details, content)
    values (v_reporter, v_subject, p_target, v_saas, v_message, p_reason, v_details, v_content)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already reported this, and it is waiting for review';
  end;
  return v_id;
end;
$$;

-- 4. Image paths name a file directly in the owner's folder, with an image extension, so a path
-- cannot climb into another maker's folder or elsewhere on the storage host.
alter table public.profiles
  drop constraint profiles_check,
  add constraint profiles_avatar_path_format check (
    avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$'));
alter table public.saas
  drop constraint saas_check,
  add constraint saas_logo_path_format check (
    logo_path is null or logo_path ~ ('^' || owner_id::text || '/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$'));

-- 5. The public views are read-only for the API roles, and objects created later in public get
-- no privileges until a migration grants them (functions still need their own revoke, because
-- Postgres grants EXECUTE to PUBLIC globally).
revoke all on public.public_saas, public.leaderboard, public.inbox from anon, authenticated;
grant select on public.public_saas, public.leaderboard to anon, authenticated;
grant select on public.inbox to authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- 6. Account deletion also removes the maker's id from other makers' queued emails and from
-- live-update events.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
begin
  if v_user is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;
  -- Deletion needs a password sign-in from the last five minutes, so a leaked or long-lived
  -- session token alone cannot delete an account. The app signs in again with the password
  -- the maker confirms, and calls this function with that fresh session.
  if not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_amr) = 'array' then v_amr else '[]' end) as entry
    where entry ->> 'method' = 'password'
      and jsonb_typeof(entry -> 'timestamp') = 'number'
      and (entry ->> 'timestamp')::numeric >= extract(epoch from now()) - 300
  ) then
    raise exception 'Confirm your password to delete your account' using errcode = '42501';
  end if;
  -- Auth records that are not linked to the user by a foreign key: the audit log keeps the
  -- email address and IP address of account events, and older rows can outlive their session.
  delete from auth.audit_log_entries
  where payload ->> 'actor_id' = v_user::text or payload -> 'traits' ->> 'user_id' = v_user::text;
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.flow_state where user_id = v_user;
  -- Other makers' queued emails and live-update events name the maker by id; they go too.
  delete from private.email_outbox o where o.payload ->> 'sender_id' = v_user::text;
  delete from realtime.messages m
  where m.topic = 'user:' || v_user::text or m.payload ->> 'sender_id' = v_user::text;
  delete from auth.users where id = v_user;
end;
$$;

-- 7. A message email is queued at the message's own time. Reading a conversation records the
-- time of the latest message read, so the email queued for it now counts as read, and the next
-- message after that read queues a new email.
create or replace function private.queue_message_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_topic text := 'message:' || new.conversation_id;
  v_read timestamptz;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end into v_recipient
  from public.conversations c where c.id = new.conversation_id;
  if v_recipient is null or not private.wants_email(v_recipient, 'message') then return null; end if;
  -- Two messages at the same moment must not both queue an email.
  perform pg_advisory_xact_lock(hashtextextended(v_recipient::text || v_topic, 0));
  select r.read_at into v_read from public.conversation_reads r
  where r.conversation_id = new.conversation_id and r.user_id = v_recipient;
  if not exists (
    select 1 from private.email_outbox o
    where o.user_id = v_recipient and o.topic = v_topic
      and o.created_at > coalesce(v_read, '-infinity'::timestamptz)
  ) then
    -- Queued at the message's own time, which is what reading it records.
    insert into private.email_outbox(user_id, kind, topic, payload, created_at)
    values (v_recipient, 'message', v_topic, jsonb_build_object(
      'conversation_id', new.conversation_id, 'sender_id', new.sender_id), new.created_at);
  end if;
  return null;
end;
$$;

-- 8. Stripe checks, successful or not: a product is refreshed at most once per five minutes, and
-- a maker starts at most 20 checks an hour, so connecting and refreshing cannot keep the server
-- busy. The app calls begin_stripe_check before it reads Stripe. Checks go with the account.
alter table public.stripe_connections add column last_checked_at timestamptz;
create table private.stripe_checks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null default now()
);
create index stripe_checks_owner_idx on private.stripe_checks(owner_id, checked_at);
alter table private.stripe_checks enable row level security;
revoke all on private.stripe_checks from public, anon, authenticated;

create function public.begin_stripe_check(p_saas uuid, p_refresh boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to connect Stripe' using errcode = '42501';
  end if;
  if not exists (select 1 from public.saas s where s.id = p_saas and s.owner_id = v_user) then
    raise exception 'You can only manage Stripe for your own SaaS';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe_check:' || v_user::text, 0));
  if p_refresh and exists (
    select 1 from public.stripe_connections c
    where c.saas_id = p_saas
      and greatest(c.last_synced_at, c.last_checked_at) > now() - interval '5 minutes'
  ) then
    raise exception 'Revenue was checked in the last few minutes. Try again later';
  end if;
  delete from private.stripe_checks k
  where k.owner_id = v_user and k.checked_at <= now() - interval '1 hour';
  if (select count(*) from private.stripe_checks k where k.owner_id = v_user) >= 20 then
    raise exception 'Stripe was checked many times in the last hour. Try again later';
  end if;
  insert into private.stripe_checks(owner_id) values (v_user);
  update public.stripe_connections set last_checked_at = now() where saas_id = p_saas;
end;
$$;
revoke execute on function public.begin_stripe_check(uuid, boolean) from public, anon, service_role;
grant execute on function public.begin_stripe_check(uuid, boolean) to authenticated;

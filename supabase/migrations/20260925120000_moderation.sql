-- Reports and moderation. Signed-in users report products, profiles and messages they received.
-- Admins (rows in private.admins) review reports in the admin panel, hide products and suspend
-- accounts with a reason and an explanation the maker sees, and every decision is logged. Hidden
-- products and suspended accounts disappear for everyone else through RLS; their owners still see
-- them, and admins see everything. Admins read a private message only when a participant reports
-- it, and then only the copy stored with the report.

-- 1. Admins. Granted with `npm run admin` locally or SQL in production, never from the app.
create table private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.admins enable row level security;
revoke all on private.admins from public, anon, authenticated;

-- Whether the caller is an admin. RLS policies call it, so both API roles may execute it; it only
-- ever answers for the caller.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- For admin functions: the caller's id, or an error for everyone else.
create function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from private.admins a where a.user_id = v_user) then
    raise exception 'Only admins can do this' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke execute on function private.require_admin() from public, anon, authenticated;

-- Reasons for reports and decisions. src/lib/moderation.ts lists the same values with labels.
create domain public.moderation_reason as text
  check (value in ('spam', 'misleading', 'impersonation', 'harassment', 'illegal', 'other'));

-- 2. Moderation state on products and profiles. Owners read it on their own rows; the column
-- grants below keep it out of their writes.
alter table public.saas
  add column hidden_at timestamptz,
  add column hidden_reason public.moderation_reason,
  add column hidden_note text not null default '' check (char_length(hidden_note) <= 1000),
  add constraint saas_hidden_reason check ((hidden_at is null) = (hidden_reason is null));
create index saas_hidden_idx on public.saas(hidden_at) where hidden_at is not null;

alter table public.profiles
  add column suspended_at timestamptz,
  add column suspended_reason public.moderation_reason,
  add column suspended_note text not null default '' check (char_length(suspended_note) <= 1000),
  add constraint profiles_suspended_reason check ((suspended_at is null) = (suspended_reason is null));
create index profiles_suspended_idx on public.profiles(suspended_at) where suspended_at is not null;

-- Makers write only the fields they edit. Moderation columns, ids and created_at are out of
-- reach, so a product can no longer be dated into the future to stay first in New arrivals.
revoke insert, update on public.saas, public.profiles from authenticated;
grant insert (id, owner_id, name, tagline, description, category, website, logo_path)
  on public.saas to authenticated;
grant update (name, tagline, description, category, website, logo_path, updated_at)
  on public.saas to authenticated;
grant insert (id, name, headline, location, bio, website, linkedin_url, github_url, x_url,
  social_url, skills, avatar_path) on public.profiles to authenticated;
grant update (name, headline, location, bio, website, linkedin_url, github_url, x_url, social_url,
  skills, avatar_path, updated_at) on public.profiles to authenticated;

-- 3. Visibility. The public views run with the caller's rights, so they follow these policies.
drop policy profiles_public_read on public.profiles;
create policy profiles_read on public.profiles for select to anon, authenticated using (
  suspended_at is null or id = (select auth.uid()) or (select public.is_admin())
);

drop policy saas_public_read on public.saas;
create policy saas_read on public.saas for select to anon, authenticated using (
  (hidden_at is null and exists (
    select 1 from public.profiles p where p.id = owner_id and p.suspended_at is null
  ))
  or owner_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy experience_public_read on public.profile_experience;
create policy experience_read on public.profile_experience for select to anon, authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.suspended_at is null)
  or profile_id = (select auth.uid())
  or (select public.is_admin())
);

-- Figures are visible exactly when their product is: the subquery runs under the saas policy.
drop policy metrics_public_read on public.public_metrics;
create policy metrics_read on public.public_metrics for select to anon, authenticated using (
  exists (select 1 from public.saas s where s.id = saas_id)
);

-- Like the inbox, the unread count only includes makers the caller can see, so a suspended
-- account's messages drop out of both.
create or replace function public.unread_message_count() returns integer
language sql stable security invoker set search_path = '' as $$
  select count(*)::integer
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles s on s.id = m.sender_id
  left join public.conversation_reads r
    on r.conversation_id = c.id and r.user_id = (select auth.uid())
  where (select auth.uid()) in (c.user_a, c.user_b)
    and m.sender_id <> (select auth.uid())
    and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz);
$$;

-- Suspended accounts can neither send nor receive messages. Otherwise unchanged.
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
  if not exists (select 1 from public.profiles p where p.id = p_recipient) then
    raise exception 'This maker no longer has an account';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_recipient and p.suspended_at is not null) then
    raise exception 'This maker cannot receive messages right now';
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

-- 4. An account lists at most 20 products and adds at most 5 a day, however they are written.
create function private.limit_saas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Concurrent inserts by the same maker wait for each other, so both limits hold exactly.
  perform pg_advisory_xact_lock(hashtextextended('saas_limit:' || new.owner_id::text, 0));
  if (select count(*) from public.saas s where s.owner_id = new.owner_id) > 20 then
    raise exception 'An account can list up to 20 products';
  end if;
  if (select count(*) from public.saas s
      where s.owner_id = new.owner_id and s.created_at > now() - interval '1 day') > 5 then
    raise exception 'You can add up to 5 products a day. Try again tomorrow';
  end if;
  return null;
end;
$$;
revoke execute on function private.limit_saas() from public, anon, authenticated;
create trigger saas_limit after insert on public.saas
  for each row execute function private.limit_saas();

-- 5. Reports, written only through submit_report(). Each keeps a copy of what was reported, so a
-- later edit cannot hide it. Deleting either the reporter's or the reported maker's account
-- deletes the report; deleting the product or message keeps the report and its copy.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- The maker responsible for the content: the product's owner, the profile, or the sender.
  subject_id uuid not null references public.profiles(id) on delete cascade,
  target text not null check (target in ('saas', 'profile', 'message')),
  saas_id uuid references public.saas(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason public.moderation_reason not null,
  details text not null default '' check (char_length(details) <= 1000),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_target check (
    (target = 'saas' and message_id is null)
    or (target = 'profile' and saas_id is null and message_id is null)
    or (target = 'message' and saas_id is null)
  ),
  constraint reports_resolved check ((status = 'open') = (resolved_at is null)),
  constraint reports_other check (reporter_id <> subject_id)
);
create index reports_status_idx on public.reports(status, created_at desc);
create index reports_subject_idx on public.reports(subject_id, status);
create index reports_reporter_idx on public.reports(reporter_id, created_at desc);
create index reports_saas_idx on public.reports(saas_id);
create index reports_message_idx on public.reports(message_id);
-- One open report per reporter and thing.
create unique index reports_open_saas on public.reports(reporter_id, saas_id)
  where status = 'open' and saas_id is not null;
create unique index reports_open_message on public.reports(reporter_id, message_id)
  where status = 'open' and message_id is not null;
create unique index reports_open_profile on public.reports(reporter_id, subject_id)
  where status = 'open' and target = 'profile';

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
-- Reporters follow their own reports and admins see all. The reported maker never sees them.
create policy reports_read on public.reports for select to authenticated using (
  reporter_id = (select auth.uid()) or (select public.is_admin())
);

-- Reports what the reporter can see: a listed product, a listed profile, or a message they
-- received. SECURITY DEFINER because makers cannot write reports. User-facing errors use P0001.
create function public.submit_report(p_target text, p_id uuid, p_reason text, p_details text)
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
revoke execute on function public.submit_report(text, uuid, text, text) from public, anon, service_role;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- 6. Every admin decision. Deleted with the account it concerns; an admin who deletes their own
-- account leaves the entries without a name.
create table public.moderation_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('hide_saas', 'restore_saas', 'suspend_account',
    'restore_account', 'dismiss_report')),
  saas_id uuid references public.saas(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  -- The product or maker name at the time, so the entry stays readable after edits.
  target_label text not null check (char_length(target_label) <= 120),
  reason public.moderation_reason,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index moderation_log_created_idx on public.moderation_log(created_at desc);
create index moderation_log_subject_idx on public.moderation_log(subject_id, created_at desc);
create index moderation_log_saas_idx on public.moderation_log(saas_id);
create index moderation_log_report_idx on public.moderation_log(report_id);
create index moderation_log_admin_idx on public.moderation_log(admin_id);

alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;
grant select on public.moderation_log to authenticated;
create policy moderation_log_admin_read on public.moderation_log for select to authenticated
  using ((select public.is_admin()));

-- 7. Admin decisions. SECURITY DEFINER because nobody writes these columns directly; each checks
-- the caller first. Messages meant for admins use P0001.
create function private.decision_note(p_note text, p_required boolean) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_required and v_note = '' then
    raise exception 'Explain the decision. The maker sees this explanation';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the explanation under 1,000 characters';
  end if;
  return v_note;
end;
$$;
revoke execute on function private.decision_note(text, boolean) from public, anon, authenticated;

create function private.decision_reason(p_reason text) returns public.moderation_reason
language plpgsql immutable set search_path = '' as $$
begin
  if p_reason is null
    or p_reason not in ('spam', 'misleading', 'impersonation', 'harassment', 'illegal', 'other') then
    raise exception 'Choose a reason';
  end if;
  return p_reason;
end;
$$;
revoke execute on function private.decision_reason(text) from public, anon, authenticated;

-- A decision may name the report it answers, which must be about the same maker.
create function private.check_report(p_report uuid, p_subject uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_report is not null and not exists (
    select 1 from public.reports r where r.id = p_report and r.subject_id = p_subject
  ) then
    raise exception 'This report is about another maker';
  end if;
end;
$$;
revoke execute on function private.check_report(uuid, uuid) from public, anon, authenticated;

create function public.admin_hide_saas(p_saas uuid, p_reason text, p_note text, p_report uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_reason public.moderation_reason := private.decision_reason(p_reason);
  v_note text := private.decision_note(p_note, true);
  v_saas public.saas%rowtype;
begin
  select * into v_saas from public.saas where id = p_saas for update;
  if v_saas.id is null then raise exception 'This product no longer exists'; end if;
  if v_saas.hidden_at is not null then raise exception 'This product is already hidden'; end if;
  perform private.check_report(p_report, v_saas.owner_id);
  update public.saas set hidden_at = now(), hidden_reason = v_reason, hidden_note = v_note
  where id = p_saas;
  insert into public.moderation_log(admin_id, subject_id, action, saas_id, report_id,
    target_label, reason, note)
  values (v_admin, v_saas.owner_id, 'hide_saas', p_saas, p_report, v_saas.name, v_reason, v_note);
  update public.reports set status = 'actioned', resolved_at = now()
  where status = 'open' and (saas_id = p_saas or id = p_report);
end;
$$;

create function public.admin_restore_saas(p_saas uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_note text := private.decision_note(p_note, false);
  v_saas public.saas%rowtype;
begin
  select * into v_saas from public.saas where id = p_saas for update;
  if v_saas.id is null then raise exception 'This product no longer exists'; end if;
  if v_saas.hidden_at is null then raise exception 'This product is not hidden'; end if;
  update public.saas set hidden_at = null, hidden_reason = null, hidden_note = '' where id = p_saas;
  insert into public.moderation_log(admin_id, subject_id, action, saas_id, target_label, note)
  values (v_admin, v_saas.owner_id, 'restore_saas', p_saas, v_saas.name, v_note);
end;
$$;

create function public.admin_suspend_account(p_profile uuid, p_reason text, p_note text,
  p_report uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_reason public.moderation_reason := private.decision_reason(p_reason);
  v_note text := private.decision_note(p_note, true);
  v_profile public.profiles%rowtype;
begin
  if p_profile = v_admin then raise exception 'You cannot suspend your own account'; end if;
  if exists (select 1 from private.admins a where a.user_id = p_profile) then
    raise exception 'Remove admin rights before suspending this account';
  end if;
  select * into v_profile from public.profiles where id = p_profile for update;
  if v_profile.id is null then raise exception 'This account has no maker profile'; end if;
  if v_profile.suspended_at is not null then raise exception 'This account is already suspended'; end if;
  perform private.check_report(p_report, p_profile);
  update public.profiles
  set suspended_at = now(), suspended_reason = v_reason, suspended_note = v_note
  where id = p_profile;
  insert into public.moderation_log(admin_id, subject_id, action, report_id, target_label, reason,
    note)
  values (v_admin, p_profile, 'suspend_account', p_report, v_profile.name, v_reason, v_note);
  -- A suspension answers every open report about the maker's products, profile and messages.
  update public.reports set status = 'actioned', resolved_at = now()
  where status = 'open' and subject_id = p_profile;
end;
$$;

create function public.admin_restore_account(p_profile uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_note text := private.decision_note(p_note, false);
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_profile for update;
  if v_profile.id is null then raise exception 'This account has no maker profile'; end if;
  if v_profile.suspended_at is null then raise exception 'This account is not suspended'; end if;
  update public.profiles set suspended_at = null, suspended_reason = null, suspended_note = ''
  where id = p_profile;
  insert into public.moderation_log(admin_id, subject_id, action, target_label, note)
  values (v_admin, p_profile, 'restore_account', v_profile.name, v_note);
end;
$$;

create function public.admin_dismiss_report(p_report uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_note text := private.decision_note(p_note, false);
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id = p_report for update;
  if v_report.id is null then raise exception 'This report no longer exists'; end if;
  if v_report.status <> 'open' then raise exception 'This report is already closed'; end if;
  update public.reports set status = 'dismissed', resolved_at = now() where id = p_report;
  insert into public.moderation_log(admin_id, subject_id, action, saas_id, report_id,
    target_label, note)
  values (v_admin, v_report.subject_id, 'dismiss_report', v_report.saas_id, p_report,
    coalesce(
      case when v_report.target = 'saas' then v_report.content ->> 'name' end,
      (select p.name from public.profiles p where p.id = v_report.subject_id)
    ),
    v_note);
end;
$$;

revoke execute on function public.admin_hide_saas(uuid, text, text, uuid),
  public.admin_restore_saas(uuid, text),
  public.admin_suspend_account(uuid, text, text, uuid),
  public.admin_restore_account(uuid, text),
  public.admin_dismiss_report(uuid, text)
  from public, anon, service_role;
grant execute on function public.admin_hide_saas(uuid, text, text, uuid),
  public.admin_restore_saas(uuid, text),
  public.admin_suspend_account(uuid, text, text, uuid),
  public.admin_restore_account(uuid, text),
  public.admin_dismiss_report(uuid, text)
  to authenticated;

-- 8. Account details for admins, which live in auth.users. Search matches part of the name or the
-- email address, without wildcards.
create function public.admin_accounts(p_search text, p_filter text)
returns table (id uuid, email text, name text, headline text, avatar_path text,
  created_at timestamptz, last_sign_in_at timestamptz, suspended_at timestamptz,
  is_admin boolean, products integer, open_reports integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  perform private.require_admin();
  return query
  select u.id, u.email::text, p.name, p.headline, p.avatar_path, u.created_at,
    u.last_sign_in_at, p.suspended_at,
    exists (select 1 from private.admins a where a.user_id = u.id),
    (select count(*)::integer from public.saas s where s.owner_id = u.id),
    (select count(*)::integer from public.reports r where r.subject_id = u.id and r.status = 'open')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where (v_search = '' or strpos(lower(coalesce(p.name, '')), v_search) > 0
      or strpos(lower(coalesce(u.email, '')), v_search) > 0)
    and case coalesce(p_filter, 'all')
      when 'suspended' then p.suspended_at is not null
      when 'reported' then exists (
        select 1 from public.reports r where r.subject_id = u.id and r.status = 'open')
      when 'admins' then exists (select 1 from private.admins a where a.user_id = u.id)
      else true
    end
  order by u.created_at desc, u.id;
end;
$$;

create function public.admin_account(p_id uuid)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    exists (select 1 from private.admins a where a.user_id = u.id)
  from auth.users u where u.id = p_id;
end;
$$;

revoke execute on function public.admin_accounts(text, text), public.admin_account(uuid)
  from public, anon, service_role;
grant execute on function public.admin_accounts(text, text), public.admin_account(uuid)
  to authenticated;

-- 9. Granting and removing admin rights, for `npm run admin` and operators. service_role only.
create function public.set_admin(p_email text, p_admin boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account uses this email address' using errcode = 'P0002';
  end if;
  if p_admin then
    insert into private.admins(user_id) values (v_user) on conflict (user_id) do nothing;
  else
    delete from private.admins where user_id = v_user;
  end if;
  return v_user;
end;
$$;

create function public.list_admins() returns table (email text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.email::text, a.created_at from private.admins a join auth.users u on u.id = a.user_id
  order by a.created_at;
$$;

revoke execute on function public.set_admin(text, boolean), public.list_admins()
  from public, anon, authenticated;
grant execute on function public.set_admin(text, boolean), public.list_admins() to service_role;

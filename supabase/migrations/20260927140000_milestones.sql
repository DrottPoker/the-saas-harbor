-- Milestones: a product whose MRR passes a threshold, or that reaches the top of the leaderboard,
-- records the milestone once and its founder gets one email with a card to share. Only public
-- facts count: MRR that is verified and shared, on a product that is shown.

-- 1. The milestones each product has reached. Visitors see them only while the product's MRR is
-- verified and shared, like the figure they describe.
create table public.saas_milestones (
  saas_id uuid not null references public.saas(id) on delete cascade,
  milestone text not null check (milestone in (
    'mrr-100', 'mrr-500', 'mrr-1000', 'mrr-2500', 'mrr-5000', 'mrr-10000', 'mrr-25000',
    'mrr-50000', 'mrr-100000', 'mrr-250000', 'mrr-500000', 'mrr-1000000',
    'top-10', 'top-3', 'top-1')),
  reached_at timestamptz not null default now(),
  primary key (saas_id, milestone)
);
alter table public.saas_milestones enable row level security;
revoke all on public.saas_milestones from anon, authenticated;
grant select on public.saas_milestones to anon, authenticated;
create policy saas_milestones_public_read on public.saas_milestones for select
  to anon, authenticated using (exists (
    select 1 from public.public_saas s
    where s.id = saas_milestones.saas_id and s.revenue_status = 'verified'));

-- 2. Milestone emails can be turned off. A null keeps the saved choice, so a caller that does not
-- know the setting leaves it as it is.
alter table public.notification_settings add column milestones boolean not null default true;

drop function public.save_notification_settings(boolean, boolean);
create function public.save_notification_settings(p_messages boolean, p_reports boolean,
  p_milestones boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to change your settings' using errcode = '42501';
  end if;
  insert into public.notification_settings(user_id, messages, reports, milestones)
  values (v_user, coalesce(p_messages, true), coalesce(p_reports, true),
    coalesce(p_milestones, true))
  on conflict (user_id) do update set messages = excluded.messages, reports = excluded.reports,
    milestones = coalesce(p_milestones, public.notification_settings.milestones),
    updated_at = now();
end;
$$;
revoke execute on function public.save_notification_settings(boolean, boolean, boolean)
  from public, anon, service_role;
grant execute on function public.save_notification_settings(boolean, boolean, boolean)
  to authenticated;

create or replace function private.wants_email(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_kind
      when 'message' then s.messages
      when 'reports' then s.reports
      when 'milestone' then s.milestones
      else true end
    from public.notification_settings s where s.user_id = p_user
  ), true);
$$;

alter table private.email_outbox drop constraint email_outbox_kind_check;
alter table private.email_outbox add constraint email_outbox_kind_check
  check (kind in ('message', 'reports', 'decision', 'outcome', 'milestone'));

-- 3. Recording. The ranked products are the leaderboard's: shown, with MRR verified in the last
-- seven days and shared, in its order. Places count only once the leaderboard has 25 products,
-- so a place among a few is not presented as an achievement.
create function private.record_milestones(p_saas_id uuid, p_notify boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_created timestamptz;
  v_mrr bigint;
  v_ranked integer;
  v_rank integer;
  v_reached text[];
  v_new text[];
begin
  select s.owner_id, s.created_at, m.mrr_cents into v_owner, v_created, v_mrr
  from public.saas s
  join public.profiles p on p.id = s.owner_id
  join public.public_metrics m on m.saas_id = s.id
  where s.id = p_saas_id and s.hidden_at is null and p.suspended_at is null
    and m.mrr_cents is not null and m.verified_at > now() - interval '7 days';
  if v_owner is null then return; end if;

  v_reached := array(
    select 'mrr-' || t from unnest(array[100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
      250000, 500000, 1000000]) as t
    where v_mrr >= t::bigint * 100);

  select count(*)::integer,
    1 + (count(*) filter (where r.mrr_cents > v_mrr
      or (r.mrr_cents = v_mrr and (r.created_at, r.id) < (v_created, p_saas_id))))::integer
  into v_ranked, v_rank
  from (
    select s.id, s.created_at, m.mrr_cents
    from public.saas s
    join public.profiles p on p.id = s.owner_id
    join public.public_metrics m on m.saas_id = s.id
    where s.hidden_at is null and p.suspended_at is null
      and m.mrr_cents is not null and m.verified_at > now() - interval '7 days'
  ) r;
  if v_ranked >= 25 then
    if v_rank <= 10 then v_reached := array_append(v_reached, 'top-10'); end if;
    if v_rank <= 3 then v_reached := array_append(v_reached, 'top-3'); end if;
    if v_rank = 1 then v_reached := array_append(v_reached, 'top-1'); end if;
  end if;

  with added as (
    insert into public.saas_milestones(saas_id, milestone)
    select p_saas_id, k from unnest(v_reached) as k
    on conflict do nothing
    returning milestone
  )
  select array_agg(milestone) into v_new from added;

  -- One email for everything reached at once, such as several thresholds at the first
  -- verification.
  if p_notify and v_new is not null and private.wants_email(v_owner, 'milestone') then
    insert into private.email_outbox(user_id, kind, topic, payload)
    values (v_owner, 'milestone', 'milestone:' || p_saas_id,
      jsonb_build_object('saas_id', p_saas_id, 'milestones', to_jsonb(v_new)));
  end if;
end;
$$;
revoke execute on function private.record_milestones(uuid, boolean)
  from public, anon, authenticated;

-- Every change to the public projection may reach a milestone: a verification, and sharing MRR.
create function private.record_milestones_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_milestones(new.saas_id, true);
  return null;
end;
$$;
revoke execute on function private.record_milestones_trigger() from public, anon, authenticated;
create trigger public_metrics_milestones after insert or update on public.public_metrics
  for each row execute function private.record_milestones_trigger();

-- What products have already reached counts as reached now, without emails: they were not
-- reached today, and founders did not ask for these emails.
select private.record_milestones(saas_id, false) from public.public_metrics;

-- 4. The worker reads what a milestone email needs when it sends it: the product's current name
-- and address, and whether its MRR is still verified and shared, since the card shows it only then.
create or replace function private.email_context(p_kind text, p_user uuid, p_payload jsonb,
  p_queued_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_conversation uuid;
  v_sender uuid;
  v_read timestamptz;
  v_report public.reports%rowtype;
begin
  if p_kind = 'message' then
    v_conversation := (p_payload ->> 'conversation_id')::uuid;
    v_sender := (p_payload ->> 'sender_id')::uuid;
    select r.read_at into v_read from public.conversation_reads r
    where r.conversation_id = v_conversation and r.user_id = p_user;
    return jsonb_build_object(
      'wanted', private.wants_email(p_user, 'message'),
      'sender_id', v_sender,
      'sender_name', (select p.name from public.profiles p where p.id = v_sender),
      'sender_suspended', exists (
        select 1 from public.profiles p where p.id = v_sender and p.suspended_at is not null),
      'blocked', exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_user and b.blocked_id = v_sender)
           or (b.blocker_id = v_sender and b.blocked_id = p_user)),
      -- Read since this email was queued: any later message queued an email of its own.
      'unread', case when v_read >= p_queued_at then 0 else (
        select count(*) from public.messages m
        where m.conversation_id = v_conversation and m.sender_id = v_sender
          and m.created_at > coalesce(v_read, '-infinity'::timestamptz)) end);
  elsif p_kind = 'reports' then
    return jsonb_build_object(
      'wanted', private.wants_email(p_user, 'reports')
        and exists (select 1 from private.admins a where a.user_id = p_user),
      'open', (select count(*) from public.reports r where r.status = 'open'));
  elsif p_kind = 'outcome' then
    select * into v_report from public.reports r where r.id = (p_payload ->> 'report_id')::uuid;
    if v_report.id is null then return null; end if;
    return jsonb_build_object('status', v_report.status, 'target', v_report.target,
      'name', v_report.content ->> 'name', 'reason', v_report.reason);
  elsif p_kind = 'milestone' then
    return (
      select jsonb_build_object(
        'wanted', private.wants_email(p_user, 'milestone') and s.owner_id = p_user,
        'shown', s.hidden_at is null and p.suspended_at is null and m.mrr_cents is not null
          and m.verified_at > now() - interval '7 days',
        'name', s.name,
        'slug', s.slug,
        'provider', m.provider,
        'milestones', p_payload -> 'milestones')
      from public.saas s
      join public.profiles p on p.id = s.owner_id
      left join public.public_metrics m on m.saas_id = s.id
      where s.id = (p_payload ->> 'saas_id')::uuid);
  end if;
  return p_payload;
end;
$$;

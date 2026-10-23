-- A new product's Telegram alert names the payment provider the founder chose when adding it, and
-- under Other the name they wrote (the owner's request of 2026-10-24). A supported provider is only
-- known from its connection, which may not exist yet when the alert is sent, such as while a
-- Gumroad approval is open or after a key the provider refused, so the alert keeps the choice.

-- 1. The choice, kept with the alert. Only the trigger writes it; the app reads only known ids.
alter table private.telegram_alerts add column provider text
  constraint telegram_alerts_provider_check check (provider is null or (
    kind = 'saas' and provider ~ '^[a-z]{1,40}$'));

-- 2. save_saas hands the choice to the trigger for this transaction. Code deployed before this
-- does not send p_provider, so a name under Other still counts as choosing Other.
drop function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],text);
create function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_revenue boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null, p_other_provider text default null,
  p_provider text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor) then
    raise exception 'Choose a username first' using errcode = 'P0001';
  end if;
  perform set_config('harbor.saas_provider',
    coalesce(p_provider, case when p_other_provider is not null then 'other' end, ''), true);
  insert into public.saas(id, owner_id, name, tagline, description, category, website, logo_path,
    tech_stack)
  values (p_id, actor, p_name, p_tagline, p_description, p_category, p_website, p_logo_path,
    coalesce(p_tech_stack, '{}'))
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline,
    description = excluded.description, category = excluded.category, website = excluded.website,
    logo_path = excluded.logo_path,
    tech_stack = coalesce(p_tech_stack, public.saas.tech_stack), updated_at = now()
  where public.saas.owner_id = actor returning id into saved_id;
  if saved_id is null then raise exception 'Not the owner' using errcode = '42501'; end if;
  insert into public.saas_settings(saas_id, owner_id, share_revenue, share_customers, launched_on,
    share_launch, other_provider)
  values (saved_id, actor, coalesce(p_share_revenue, false), p_share_customers, p_launched_on,
    p_share_launch, p_other_provider)
  on conflict (saas_id) do update set share_revenue = excluded.share_revenue,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch, other_provider = excluded.other_provider,
    updated_at = now();
  return saved_id;
end;
$$;
revoke execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],text,text) from public, anon;
grant execute on function public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean,text[],text,text) to authenticated;

-- 3. The trigger keeps it. Anything that is not a plain id is left out rather than failing the save.
create or replace function private.queue_saas_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_provider text := nullif(current_setting('harbor.saas_provider', true), '');
begin
  insert into private.telegram_alerts(kind, user_id, saas_id, provider)
  values ('saas', new.owner_id, new.id,
    case when v_provider ~ '^[a-z]{1,40}$' then v_provider end);
  return null;
end;
$$;

-- 4. What the alert says: as before, with the provider, and under Other the name as it is now.
create or replace function private.telegram_alert_context(p_alert private.telegram_alerts)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user record;
  v_feedback public.feedback%rowtype;
  v_saas public.saas%rowtype;
  v_report public.reports%rowtype;
  v_message public.messages%rowtype;
  v_recipient uuid;
begin
  if p_alert.kind = 'feedback' then
    select * into v_feedback from public.feedback f where f.id = p_alert.feedback_id;
    if v_feedback.id is null then return null; end if;
    if v_feedback.user_id is null then
      return jsonb_build_object('visitor', true, 'reply', v_feedback.reply_email is not null,
        'feedback_kind', v_feedback.kind, 'message', v_feedback.message, 'page', v_feedback.page);
    end if;
  end if;
  select u.raw_app_meta_data ->> 'provider' as provider, u.email_confirmed_at is not null
      as confirmed, p.name, p.slug, p.suspended_at is not null as suspended
    into v_user
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_alert.user_id;
  if not found then return null; end if;
  if p_alert.kind = 'signup' then
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'provider', v_user.provider, 'confirmed', v_user.confirmed,
      'accounts', (select count(*) from auth.users));
  elsif p_alert.kind = 'feedback' then
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'feedback_kind', v_feedback.kind, 'message', v_feedback.message, 'page', v_feedback.page);
  elsif p_alert.kind = 'saas' then
    select * into v_saas from public.saas s where s.id = p_alert.saas_id;
    if v_saas.id is null then return null; end if;
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'product', v_saas.name, 'tagline', v_saas.tagline, 'category', v_saas.category,
      'slug', v_saas.slug, 'hidden', v_saas.hidden_at is not null,
      'payment_provider', p_alert.provider,
      'other_provider', case when p_alert.provider = 'other' then (
        select st.other_provider from public.saas_settings st where st.saas_id = v_saas.id) end);
  elsif p_alert.kind = 'report' then
    select * into v_report from public.reports r where r.id = p_alert.report_id;
    if v_report.id is null then return null; end if;
    -- The report's copy of a message stays in the admin panel.
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'report_id', v_report.id, 'target', v_report.target,
      'target_name', case when v_report.target = 'saas' then v_report.content ->> 'name' end,
      'subject_name', (select p.name from public.profiles p where p.id = v_report.subject_id),
      'reason', v_report.reason, 'details', v_report.details,
      'open_reports', (select count(*) from public.reports r where r.status = 'open'));
  elsif p_alert.kind = 'message' then
    select * into v_message from public.messages m where m.id = p_alert.message_id;
    if v_message.id is null then return null; end if;
    select case when c.user_a = v_message.sender_id then c.user_b else c.user_a end
      into v_recipient
    from public.conversations c where c.id = v_message.conversation_id;
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'sender_id', v_message.sender_id, 'sender_suspended', v_user.suspended,
      'wanted', exists (select 1 from private.telegram_inboxes i where i.user_id = v_recipient),
      'blocked', exists (
        select 1 from public.blocks b
        where (b.blocker_id = v_recipient and b.blocked_id = v_message.sender_id)
           or (b.blocker_id = v_message.sender_id and b.blocked_id = v_recipient)));
  end if;
  return null;
end;
$$;

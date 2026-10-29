-- New-account alerts include the registration country before email confirmation.
-- Email sign-up supplies the host's country; OAuth uses its recorded sign-in country.
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
      as confirmed, p.name, p.slug, p.suspended_at is not null as suspended,
      case when u.raw_user_meta_data ->> 'signup_country' ~ '^[A-Z]{2}$'
          and u.raw_user_meta_data ->> 'signup_country' <> 'XX'
        then u.raw_user_meta_data ->> 'signup_country'
        else c.country end as country
    into v_user
  from auth.users u left join public.profiles p on p.id = u.id
  left join private.sign_in_countries c on c.user_id = u.id
  where u.id = p_alert.user_id;
  if not found then return null; end if;
  if p_alert.kind = 'signup' then
    return jsonb_build_object('name', v_user.name, 'username', v_user.slug,
      'provider', v_user.provider, 'confirmed', v_user.confirmed, 'country', v_user.country,
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

revoke execute on function private.telegram_alert_context(private.telegram_alerts)
  from public, anon, authenticated, service_role;

-- Admins control whether new products may list without a provider connection.
create table private.listing_settings (
  singleton boolean primary key default true check (singleton),
  allow_other_provider boolean not null default true
);
alter table private.listing_settings enable row level security;
revoke all on private.listing_settings from public, anon, authenticated, service_role;
insert into private.listing_settings(singleton) values (true);

create function public.listing_settings() returns boolean
language sql stable security definer set search_path = '' as $$
  select allow_other_provider from private.listing_settings where singleton;
$$;
revoke execute on function public.listing_settings() from public, anon, authenticated, service_role;
grant execute on function public.listing_settings() to anon, authenticated;

create function public.admin_update_listing_settings(p_allow_other_provider boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_allow_other_provider is null then
    raise exception 'Choose a valid listing setting' using errcode = '22023';
  end if;
  update private.listing_settings set allow_other_provider = p_allow_other_provider where singleton;
end;
$$;
revoke execute on function public.admin_update_listing_settings(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_listing_settings(boolean) to authenticated;

-- Column grants keep founders from publishing a pending product themselves.
alter table public.saas add column listing_pending boolean not null default false;
create function private.require_listing_connection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select not allow_other_provider into new.listing_pending
    from private.listing_settings where singleton for share;
  return new;
end;
$$;
revoke execute on function private.require_listing_connection()
  from public, anon, authenticated, service_role;
create trigger saas_listing_connection before insert on public.saas
  for each row execute function private.require_listing_connection();

-- Direct settings writes obey the policy too. Re-enabling Other lets a founder publish by
-- choosing Other again; changing the global setting alone never publishes pending products.
create function private.check_other_provider() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed boolean;
begin
  select allow_other_provider into allowed from private.listing_settings where singleton for share;
  if new.other_provider is not null then
    if not allowed then
      raise exception 'Connect a supported payment provider to list your SaaS' using errcode = 'P0001';
    end if;
    update public.saas set listing_pending = false where id = new.saas_id and listing_pending;
  end if;
  return new;
end;
$$;
revoke execute on function private.check_other_provider() from public, anon, authenticated, service_role;
create trigger saas_settings_listing_policy before insert or update of other_provider on public.saas_settings
  for each row execute function private.check_other_provider();

-- Only trusted verification can create a connection. A zero-revenue connection also qualifies.
create function private.publish_connected_saas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.saas set listing_pending = false where id = new.saas_id and listing_pending;
  return new;
end;
$$;
revoke execute on function private.publish_connected_saas() from public, anon, authenticated, service_role;
create trigger revenue_connection_publish after insert on public.revenue_connections
  for each row execute function private.publish_connected_saas();

alter policy saas_read on public.saas using (
  (not listing_pending and hidden_at is null and exists (
    select 1 from public.profiles p where p.id = owner_id and p.suspended_at is null
  ))
  or owner_id = (select auth.uid())
  or (select public.is_admin())
);

create or replace function public.saas_slug_redirect(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select s.slug from private.saas_slug_redirects r
  join public.saas s on s.id = r.saas_id
  join public.profiles p on p.id = s.owner_id
  where r.slug = lower(p_slug) and not s.listing_pending
    and s.hidden_at is null and p.suspended_at is null;
$$;
revoke execute on function public.saas_slug_redirect(text) from public;

-- Reports must not reveal pending product details through their stored copy.
CREATE OR REPLACE FUNCTION public.submit_report(p_target text, p_id uuid, p_reason text, p_details text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where s.id = p_id and not s.listing_pending and s.hidden_at is null and p.suspended_at is null;
    if v_subject is null then raise exception 'This product could not be found'; end if;
    if v_subject = v_reporter then raise exception 'You cannot report your own product'; end if;
  elsif p_target = 'profile' then
    select p.id, jsonb_build_object('name', p.name, 'headline', p.headline,
        'location', p.location, 'website', p.website,
        'linkedin_url', p.linkedin_url, 'github_url', p.github_url, 'x_url', p.x_url,
        'social_url', p.social_url, 'avatar_path', p.avatar_path)
      into v_subject, v_content
    from public.profiles p where p.id = p_id and p.suspended_at is null;
    if v_subject is null then raise exception 'This user could not be found'; end if;
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
$function$;
revoke execute on function public.submit_report(text,uuid,text,text) from public;

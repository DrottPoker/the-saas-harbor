-- Profiles are created only by sign-up (review of 2026-10-01): by the trigger on auth.users when the
-- sign-up carries a valid username and the accepted Terms, or by complete_signup afterwards. Before,
-- a signed-in user without a profile could insert one directly, or through save_profile or
-- save_saas, under any name. That skipped the username rules (a reserved name such as support
-- became the address) and the Terms, and kept an account that never finished sign-up through
-- Google or GitHub from being deleted.

-- 1. No direct inserts. Revoking the table privilege revokes the column privileges with it.
drop policy profiles_owner_insert on public.profiles;
revoke insert on public.profiles from authenticated;

-- 2. save_profile updates the profile and no longer creates one.
create or replace function public.save_profile(
  p_name text, p_headline text, p_location text, p_bio text, p_website text,
  p_linkedin_url text, p_github_url text, p_x_url text, p_social_url text, p_skills text[],
  p_avatar_path text, p_experience jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_experience) is distinct from 'array' then
    raise exception 'Experience must be a list' using errcode = '22023';
  end if;
  update public.profiles set name = p_name, headline = p_headline, location = p_location,
    bio = p_bio, website = p_website, linkedin_url = p_linkedin_url, github_url = p_github_url,
    x_url = p_x_url, social_url = p_social_url, skills = p_skills, avatar_path = p_avatar_path,
    updated_at = now()
  where id = v_user;
  if not found then
    raise exception 'Choose a username first' using errcode = 'P0001';
  end if;
  delete from public.profile_experience where profile_id = v_user;
  insert into public.profile_experience(profile_id, title, organization, starts_on, ends_on,
    description)
  select v_user, e.title, e.organization, e.starts_on, e.ends_on, coalesce(e.description, '')
  from jsonb_to_recordset(p_experience) as e(title text, organization text, starts_on date,
    ends_on date, description text);
end;
$$;

-- 3. save_saas no longer creates a missing profile.
create or replace function public.save_saas(
  p_id uuid, p_name text, p_tagline text, p_description text, p_category text, p_website text,
  p_logo_path text, p_launched_on date, p_share_mrr boolean, p_share_customers boolean,
  p_share_launch boolean, p_tech_stack text[] default null, p_share_revenue boolean default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = actor) then
    raise exception 'Choose a username first' using errcode = 'P0001';
  end if;
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
  insert into public.saas_settings(saas_id, owner_id, share_mrr, share_customers, launched_on,
    share_launch, share_revenue)
  values (saved_id, actor, p_share_mrr, p_share_customers, p_launched_on, p_share_launch,
    coalesce(p_share_revenue, false))
  on conflict (saas_id) do update set share_mrr = excluded.share_mrr,
    share_customers = excluded.share_customers, launched_on = excluded.launched_on,
    share_launch = excluded.share_launch,
    share_revenue = coalesce(p_share_revenue, public.saas_settings.share_revenue),
    updated_at = now();
  return saved_id;
end;
$$;

-- 4. Whether a sign-up's metadata accepts the Terms: a real date, at the latest today, as
-- complete_signup asks.
create function private.accepts_terms(p_version text) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  return coalesce(p_version ~ '^\d{4}-\d{2}-\d{2}$' and p_version::date <= current_date, false);
exception when datetime_field_overflow or invalid_datetime_format then
  return false;
end;
$$;
revoke execute on function private.accepts_terms(text) from public, anon, authenticated;

-- 5. Sign-up creates the profile only when the Terms were accepted, as the app's form always
-- sends them. A sign-up made straight through the Auth API without them has no profile, so it
-- chooses a username and accepts the Terms at /auth/finish before anything else opens.
create or replace function private.create_profile_from_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if not private.accepts_terms(new.raw_user_meta_data ->> 'terms_version') then
    return new;
  end if;
  if private.username_problem(v_username, new.id) is distinct from null
    and private.username_problem(v_username, new.id) <> 'taken' then
    return new;
  end if;
  begin
    insert into public.profiles(id, name, slug)
    values (new.id, v_username,
      case when private.username_problem(v_username, new.id) is null then v_username end)
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles(id, name) values (new.id, v_username) on conflict (id) do nothing;
  end;
  return new;
end;
$$;

-- Maker profiles follow the product page's design: no cover image, no Open to box and no education.
-- Experience stays, in a table named for what it now holds.

drop function public.save_profile(text, text, text, text, text, text, text, text, text, text[],
  text[], text, text, jsonb);
drop trigger profile_entries_limit on public.profile_entries;
drop function private.limit_profile_entries();

alter table public.profiles drop column open_to, drop column cover_path;

delete from public.profile_entries where kind = 'education';
alter table public.profile_entries drop column kind;
alter table public.profile_entries rename to profile_experience;
alter table public.profile_experience rename constraint profile_entries_pkey to profile_experience_pkey;
alter table public.profile_experience
  rename constraint profile_entries_profile_id_fkey to profile_experience_profile_id_fkey;
alter table public.profile_experience rename constraint profile_entries_order to profile_experience_order;
alter table public.profile_experience
  rename constraint profile_entries_title_check to profile_experience_title_check;
alter table public.profile_experience
  rename constraint profile_entries_organization_check to profile_experience_organization_check;
alter table public.profile_experience
  rename constraint profile_entries_starts_on_check to profile_experience_starts_on_check;
alter table public.profile_experience
  rename constraint profile_entries_ends_on_check to profile_experience_ends_on_check;
alter table public.profile_experience
  rename constraint profile_entries_description_check to profile_experience_description_check;
-- The old index covered the dropped kind column and went with it.
create index profile_experience_profile_idx on public.profile_experience(profile_id, starts_on desc);
alter policy entries_public_read on public.profile_experience rename to experience_public_read;
alter policy entries_owner_insert on public.profile_experience rename to experience_owner_insert;
alter policy entries_owner_delete on public.profile_experience rename to experience_owner_delete;

-- A profile lists at most 40 roles, however they are written.
create function private.limit_profile_experience() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.profile_experience where profile_id = new.profile_id) > 40 then
    raise exception 'A profile can list up to 40 roles' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke execute on function private.limit_profile_experience() from public, anon, authenticated;
create trigger profile_experience_limit after insert on public.profile_experience
  for each row execute function private.limit_profile_experience();

-- Saves the whole profile, including its experience, in one transaction. Invoker rights: RLS
-- decides, so a maker can only ever write their own profile.
create function public.save_profile(
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
  insert into public.profiles(id, name, headline, location, bio, website, linkedin_url,
    github_url, x_url, social_url, skills, avatar_path)
  values (v_user, p_name, p_headline, p_location, p_bio, p_website, p_linkedin_url, p_github_url,
    p_x_url, p_social_url, p_skills, p_avatar_path)
  on conflict (id) do update set name = excluded.name, headline = excluded.headline,
    location = excluded.location, bio = excluded.bio, website = excluded.website,
    linkedin_url = excluded.linkedin_url, github_url = excluded.github_url, x_url = excluded.x_url,
    social_url = excluded.social_url, skills = excluded.skills, avatar_path = excluded.avatar_path,
    updated_at = now();
  delete from public.profile_experience where profile_id = v_user;
  insert into public.profile_experience(profile_id, title, organization, starts_on, ends_on,
    description)
  select v_user, e.title, e.organization, e.starts_on, e.ends_on, coalesce(e.description, '')
  from jsonb_to_recordset(p_experience) as e(title text, organization text, starts_on date,
    ends_on date, description text);
end;
$$;
revoke execute on function public.save_profile(text, text, text, text, text, text, text, text,
  text, text[], text, jsonb) from public, anon;
grant execute on function public.save_profile(text, text, text, text, text, text, text, text,
  text, text[], text, jsonb) to authenticated;

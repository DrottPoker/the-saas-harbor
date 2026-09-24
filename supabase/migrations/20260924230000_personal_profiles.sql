-- Personal maker profiles in the spirit of LinkedIn: a headline, a location, a longer About (the
-- existing bio column), what the maker is open to, skills, links to LinkedIn, GitHub and X, a
-- cover image, and experience and education entries. Everything on a profile is public.

-- Short labels such as skills: trimmed, 1 to max_length characters, no control characters, no
-- duplicates ignoring case. Used by a CHECK constraint, so it stays callable by every role.
create function private.valid_labels(p_labels text[], p_max_count integer, p_max_length integer)
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(p_labels) <= p_max_count
    and not exists (
      select 1 from unnest(p_labels) as label
      where label is null or char_length(label) not between 1 and p_max_length
        or label <> btrim(label) or label ~ '[[:cntrl:]]'
    )
    and cardinality(p_labels) = (select count(distinct lower(label)) from unnest(p_labels) as label);
$$;

alter table public.profiles
  add column headline text not null default '' check (char_length(headline) <= 120),
  add column location text not null default '' check (char_length(location) <= 80),
  add column linkedin_url text not null default '' check (linkedin_url = '' or (
    linkedin_url ~* '^https://([a-z0-9-]+\.)*linkedin\.com/' and char_length(linkedin_url) <= 500)),
  add column github_url text not null default '' check (github_url = '' or (
    github_url ~* '^https://(www\.)?github\.com/' and char_length(github_url) <= 500)),
  add column x_url text not null default '' check (x_url = '' or (
    x_url ~* '^https://(www\.)?(x|twitter)\.com/' and char_length(x_url) <= 500)),
  add column open_to text[] not null default '{}' check (open_to <@ array['cofounder',
    'collaboration', 'feedback', 'mentoring', 'investment', 'hiring', 'freelance',
    'acquisition']::text[]),
  add column skills text[] not null default '{}' check (private.valid_labels(skills, 20, 40)),
  add column cover_path text check (cover_path is null or (
    cover_path like id::text || '/%' and char_length(cover_path) <= 512));

-- The short bio becomes the About section.
alter table public.profiles drop constraint profiles_bio_check;
alter table public.profiles add constraint profiles_bio_length check (char_length(bio) <= 2000);

-- Existing social links that point to LinkedIn, GitHub or X move to their own fields.
update public.profiles set linkedin_url = social_url, social_url = ''
where social_url ~* '^https://([a-z0-9-]+\.)*linkedin\.com/';
update public.profiles set github_url = social_url, social_url = ''
where social_url ~* '^https://(www\.)?github\.com/';
update public.profiles set x_url = social_url, social_url = ''
where social_url ~* '^https://(www\.)?(x|twitter)\.com/';

-- Experience and education. Months are stored as the first day of the month; no end month means
-- the maker is still there.
create table public.profile_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('experience', 'education')),
  title text not null check (char_length(title) between 1 and 100 and title = btrim(title)),
  organization text not null
    check (char_length(organization) between 1 and 100 and organization = btrim(organization)),
  starts_on date not null check (starts_on between date '1900-01-01' and date '2100-12-01'
    and extract(day from starts_on) = 1),
  ends_on date check (ends_on is null or (ends_on between date '1900-01-01' and date '2100-12-01'
    and extract(day from ends_on) = 1)),
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  constraint profile_entries_order check (ends_on is null or ends_on >= starts_on)
);
create index profile_entries_profile_idx on public.profile_entries(profile_id, kind, starts_on desc);

alter table public.profile_entries enable row level security;
revoke all on public.profile_entries from anon, authenticated;
grant select on public.profile_entries to anon, authenticated;
grant insert, delete on public.profile_entries to authenticated;
create policy entries_public_read on public.profile_entries for select to anon, authenticated
  using (true);
create policy entries_owner_insert on public.profile_entries for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy entries_owner_delete on public.profile_entries for delete to authenticated
  using (profile_id = (select auth.uid()));

-- A profile lists at most 40 entries, however they are written.
create function private.limit_profile_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.profile_entries where profile_id = new.profile_id) > 40 then
    raise exception 'A profile can list up to 40 entries' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke execute on function private.limit_profile_entries() from public, anon, authenticated;
create trigger profile_entries_limit after insert on public.profile_entries
  for each row execute function private.limit_profile_entries();

-- Saves the whole profile, including its entries, in one transaction. Invoker rights: RLS
-- decides, so a maker can only ever write their own profile.
create function public.save_profile(
  p_name text, p_headline text, p_location text, p_bio text, p_website text,
  p_linkedin_url text, p_github_url text, p_x_url text, p_social_url text, p_open_to text[],
  p_skills text[], p_avatar_path text, p_cover_path text, p_entries jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Entries must be a list' using errcode = '22023';
  end if;
  insert into public.profiles(id, name, headline, location, bio, website, linkedin_url,
    github_url, x_url, social_url, open_to, skills, avatar_path, cover_path)
  values (v_user, p_name, p_headline, p_location, p_bio, p_website, p_linkedin_url, p_github_url,
    p_x_url, p_social_url, p_open_to, p_skills, p_avatar_path, p_cover_path)
  on conflict (id) do update set name = excluded.name, headline = excluded.headline,
    location = excluded.location, bio = excluded.bio, website = excluded.website,
    linkedin_url = excluded.linkedin_url, github_url = excluded.github_url, x_url = excluded.x_url,
    social_url = excluded.social_url, open_to = excluded.open_to, skills = excluded.skills,
    avatar_path = excluded.avatar_path, cover_path = excluded.cover_path, updated_at = now();
  delete from public.profile_entries where profile_id = v_user;
  insert into public.profile_entries(profile_id, kind, title, organization, starts_on, ends_on,
    description)
  select v_user, e.kind, e.title, e.organization, e.starts_on, e.ends_on,
    coalesce(e.description, '')
  from jsonb_to_recordset(p_entries) as e(kind text, title text, organization text,
    starts_on date, ends_on date, description text);
end;
$$;
revoke execute on function public.save_profile(text, text, text, text, text, text, text, text,
  text, text[], text[], text, text, jsonb) from public, anon;
grant execute on function public.save_profile(text, text, text, text, text, text, text, text,
  text, text[], text[], text, text, jsonb) to authenticated;

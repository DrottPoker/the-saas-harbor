-- Founders prove that they control their product's domain with a DNS TXT record: the name
-- _thesaasharbor.<domain> with the value thesaasharbor-verification=<token>, a token per product.
-- The app looks the record up when the founder asks, and again every day for verified domains; a
-- record that stays missing for three days removes the mark. The product page then says the
-- domain is verified. Several products may verify one domain, since its owner can add a record
-- for each of them.

-- 1. The public result on the product, which makers cannot write: the verified domain and when
-- it was last confirmed.
alter table public.saas
  add column verified_domain text
    constraint saas_verified_domain_check check (verified_domain is null or (
      char_length(verified_domain) <= 253 and verified_domain = lower(verified_domain))),
  add column domain_verified_at timestamptz,
  add constraint saas_domain_verified check ((verified_domain is null) = (domain_verified_at is null));

-- 2. Per product: the token for its record, when it was last looked up, and since when a
-- verified record has been missing. Private; the founder reads their own through a function.
create table private.saas_domains (
  saas_id uuid primary key references public.saas(id) on delete cascade,
  token text not null default replace(gen_random_uuid()::text, '-', '')
    check (token ~ '^[0-9a-f]{32}$'),
  checked_at timestamptz,
  missing_since timestamptz
);
create index saas_domains_due_idx on private.saas_domains(checked_at);
alter table private.saas_domains enable row level security;
revoke all on private.saas_domains from public, anon, authenticated;
grant select, insert, update, delete on private.saas_domains to service_role;
insert into private.saas_domains(saas_id) select id from public.saas;

-- Checks a maker starts, for the hourly limit. Kept an hour.
create table private.domain_checks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null default now()
);
create index domain_checks_owner_idx on private.domain_checks(owner_id, checked_at);
alter table private.domain_checks enable row level security;
revoke all on private.domain_checks from public, anon, authenticated;

-- Every new product gets its token.
create function private.add_saas_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.saas_domains(saas_id) values (new.id);
  return null;
end;
$$;
revoke execute on function private.add_saas_domain() from public, anon, authenticated;
create trigger saas_domain_token after insert on public.saas
  for each row execute function private.add_saas_domain();

-- 3. A website on another host loses the mark at once, however it is written. The host is
-- compared without www., so moving between example.com and www.example.com keeps it.
create function private.website_host(p_url text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(substring(p_url from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)')),
    '^.*@', ''), ':[0-9]*$', ''), '\.$', ''), '^www\.', ''), '');
$$;
revoke execute on function private.website_host(text) from public, anon, authenticated;

create function private.saas_website_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.website_host(new.website) is distinct from private.website_host(old.website) then
    new.verified_domain := null;
    new.domain_verified_at := null;
    update private.saas_domains set missing_since = null where saas_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.saas_website_changed() from public, anon, authenticated;
create trigger saas_website_changed before update of website on public.saas
  for each row execute function private.saas_website_changed();

-- 4. The founder reads the token for their product's record, and the state of the checks.
create function public.saas_domain_verification(p_saas uuid)
returns table(token text, checked_at timestamptz, missing_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.token, d.checked_at, d.missing_since
  from private.saas_domains d
  join public.saas s on s.id = d.saas_id
  where d.saas_id = p_saas and s.owner_id = (select auth.uid());
$$;
revoke execute on function public.saas_domain_verification(uuid) from public, anon;
grant execute on function public.saas_domain_verification(uuid) to authenticated;

-- A check the founder starts: their own product, once every ten seconds per product and 30 an
-- hour per founder. Returns the token to look for.
create function public.begin_domain_check(p_saas uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_token text;
  v_checked timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in to verify a domain' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('domain_check:' || v_user::text, 0));
  select d.token, d.checked_at into v_token, v_checked
  from private.saas_domains d
  join public.saas s on s.id = d.saas_id
  where d.saas_id = p_saas and s.owner_id = v_user;
  if v_token is null then
    raise exception 'You can only verify the domain of your own SaaS';
  end if;
  if v_checked > now() - interval '10 seconds' then
    raise exception 'The domain was checked a moment ago. Try again in a few seconds';
  end if;
  delete from private.domain_checks k
  where k.owner_id = v_user and k.checked_at <= now() - interval '1 hour';
  if (select count(*) from private.domain_checks k where k.owner_id = v_user) >= 30 then
    raise exception 'Domains were checked many times in the last hour. Try again later';
  end if;
  insert into private.domain_checks(owner_id) values (v_user);
  update private.saas_domains set checked_at = now() where saas_id = p_saas;
  return v_token;
end;
$$;
revoke execute on function public.begin_domain_check(uuid) from public, anon, service_role;
grant execute on function public.begin_domain_check(uuid) to authenticated;

-- 5. The trusted write of a lookup's result, for service_role only: 'found', 'missing' or
-- 'error' (DNS did not answer, which changes nothing). A result for a website that has changed
-- since is dropped. Returns what happened: verified, missing, grace, removed, error, changed or
-- gone.
create function public.record_domain_check(p_saas uuid, p_website text, p_domain text,
  p_result text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_website text;
  v_verified text;
  v_since timestamptz;
begin
  if p_result not in ('found', 'missing', 'error') then
    raise exception 'Unknown result' using errcode = '22023';
  end if;
  select s.website, s.verified_domain into v_website, v_verified
  from public.saas s where s.id = p_saas for update;
  if v_website is null then return 'gone'; end if;
  if v_website <> p_website then return 'changed'; end if;
  if p_result = 'found' then
    update public.saas set verified_domain = lower(p_domain), domain_verified_at = now()
    where id = p_saas;
    update private.saas_domains set checked_at = now(), missing_since = null
    where saas_id = p_saas;
    return 'verified';
  elsif p_result = 'error' then
    update private.saas_domains set checked_at = now() where saas_id = p_saas;
    return 'error';
  end if;
  update private.saas_domains set checked_at = now(),
    missing_since = case when v_verified is null then null else coalesce(missing_since, now()) end
  where saas_id = p_saas
  returning missing_since into v_since;
  if v_verified is null then return 'missing'; end if;
  if v_since <= now() - interval '3 days' then
    update public.saas set verified_domain = null, domain_verified_at = null where id = p_saas;
    update private.saas_domains set missing_since = null where saas_id = p_saas;
    return 'removed';
  end if;
  return 'grace';
end;
$$;
revoke execute on function public.record_domain_check(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_domain_check(uuid, text, text, text) to service_role;

-- The daily check of verified domains claims those not looked up for 23 hours, oldest first.
-- Claiming marks them checked, so an overlapping run skips them.
create function public.claim_due_domain_checks(p_limit integer)
returns table(saas_id uuid, website text, token text)
language sql security invoker set search_path = '' as $$
  with due as materialized (
    select d.saas_id from private.saas_domains d
    join public.saas s on s.id = d.saas_id
    where s.verified_domain is not null
      and coalesce(d.checked_at, '-infinity') < now() - interval '23 hours'
    order by coalesce(d.checked_at, '-infinity'), d.saas_id
    limit p_limit
    for update of d skip locked
  )
  update private.saas_domains d set checked_at = now()
  from due, public.saas s
  where d.saas_id = due.saas_id and s.id = d.saas_id
  returning d.saas_id, s.website, d.token;
$$;
revoke execute on function public.claim_due_domain_checks(integer) from public, anon, authenticated;
grant execute on function public.claim_due_domain_checks(integer) to service_role;

-- 6. The public projection carries the verified domain. The new columns are appended, so both
-- views are replaced in place.
create or replace view public.public_saas with (security_invoker = true) as
select s.id, s.owner_id, s.name, s.tagline, s.description, s.category, s.website, s.logo_path,
  s.created_at, s.updated_at, p.name as owner_name, p.avatar_path as owner_avatar_path,
  case when m.verified_at > now() - interval '7 days' then m.mrr_cents end as mrr_cents,
  case when m.verified_at > now() - interval '7 days' then m.customers end as customers,
  m.launched_on, m.verified_at, m.livemode,
  case
    when m.verified_at is null then 'unverified'
    when m.verified_at <= now() - interval '7 days' then 'stale'
    when m.mrr_cents is null then 'private'
    else 'verified'
  end as revenue_status,
  case when m.verified_at > now() - interval '7 days' then m.mrr_history end as mrr_history,
  case when m.verified_at > now() - interval '7 days' then m.mrr_growth_pct end as mrr_growth_pct,
  s.slug, p.slug as owner_slug, m.provider, s.tech_stack, s.verified_domain, s.domain_verified_at
from public.saas s
join public.profiles p on p.id = s.owner_id
left join public.public_metrics m on m.saas_id = s.id;

create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (order by mrr_cents desc, created_at asc, id asc) as rank, s.*
from public.public_saas s where s.revenue_status = 'verified';

-- 7. The daily check runs every hour at 23 minutes past, for the domains that are due.
select cron.schedule('harbor-domain-checks', '23 * * * *',
  $$ select private.run_scheduled_job('/api/domains/check', 70000) $$);

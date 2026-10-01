-- The database reads a product's website the way browsers do (review of 2026-10-01). A backslash
-- did not end the host here, so https://a.example\@b.example was b.example to the database and
-- a.example to the app and to browsers: a founder could verify a.example, then move the website to
-- b.example and keep the mark, since the trigger saw the same host before and after.

-- 1. The host of an http(s) address as browsers read it: tabs and line breaks are dropped, a
-- backslash counts as a slash, and any number of slashes may follow the scheme.
create or replace function private.website_host(p_url text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(substring(replace(regexp_replace(p_url, '[\t\n\r]', '', 'g'), '\', '/')
      from '^[A-Za-z][A-Za-z0-9+.-]*:/*([^/?#]*)')),
    '^.*@', ''), ':[0-9]*$', ''), '\.$', ''), '^www\.', ''), '');
$$;

-- 2. A website holds no spaces, control characters or backslashes, which a valid address never
-- needs and which browsers and other parsers read differently.
alter table public.saas add constraint saas_website_plain
  check (website !~ '[[:space:][:cntrl:]]' and strpos(website, '\') = 0);

-- Site statistics: who may record and read page views, the daily visitor hash, visits, the limit,
-- the admin totals and the retention job. Runs in a rolled-back transaction, and starts from no
-- page views so local browsing does not change the figures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

delete from private.page_views;
delete from private.analytics_salts;
insert into private.analytics_salts(day, salt)
values ((now() at time zone 'UTC')::date - 2, extensions.gen_random_bytes(32));

insert into auth.users(id, email) values
  ('e5000000-0000-4000-8000-000000000001', 'user@analytics.test'),
  ('e5000000-0000-4000-8000-000000000002', 'admin@analytics.test');
insert into private.admins(user_id) values ('e5000000-0000-4000-8000-000000000002');

-- Only the server records page views.
set local role anon;
select throws_ok(
  $$ select public.record_page_view('203.0.113.7', 'UA', '/', null, null, null, null, null,
     'desktop', 'Chrome', 'Windows') $$,
  '42501', null, 'visitors cannot record page views directly');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.record_page_view('203.0.113.7', 'UA', '/', null, null, null, null, null,
     'desktop', 'Chrome', 'Windows') $$,
  '42501', null, 'users cannot record page views directly');
select throws_ok($$ select * from private.page_views $$, '42501', null,
  'users cannot read page views');
reset role;

set local role service_role;
select is(
  public.record_page_view('203.0.113.7', 'Browser A', '/', 'news.ycombinator.com', 'newsletter',
    'email', 'launch', 'SE', 'desktop', 'Chrome', 'Windows'),
  true, 'the server records a page view');
select public.record_page_view('203.0.113.7', 'Browser A', '/stats', 'news.ycombinator.com',
  'newsletter', 'email', 'launch', 'SE', 'desktop', 'Chrome', 'Windows');
select public.record_page_view('203.0.113.7', 'Browser B', '/about', null, null, null, null, 'SE',
  'mobile', 'Safari', 'iOS');
select throws_ok(
  $$ select public.record_page_view('203.0.113.7', 'Browser A', 'no-slash', null, null, null,
     null, null, 'desktop', 'Chrome', 'Windows') $$,
  '23514', null, 'only paths on this site');
reset role;

select results_eq(
  $$ select path, entry, referrer, utm_source, utm_campaign from private.page_views order by id $$,
  $$ values ('/'::text, true, 'news.ycombinator.com'::text, 'newsletter'::text, 'launch'::text),
    ('/stats', false, null, null, null), ('/about', true, null, null, null) $$,
  'a visit starts with its first page, which alone keeps where it came from');
select is((select count(distinct visitor) from private.page_views), 2::bigint,
  'the same address and browser is one visitor, another browser another');
select ok((select bool_and(octet_length(visitor) = 16) from private.page_views),
  'visitors are 16-byte hashes');
select is_empty(
  $$ select 1 from private.page_views v where v::text like '%203.0.113%' or v::text like '%Browser%' $$,
  'neither the address nor the user agent is stored');
select results_eq(
  $$ select day from private.analytics_salts $$,
  $$ values ((now() at time zone 'UTC')::date) $$,
  'one salt for today; earlier days are deleted');

-- After 30 quiet minutes the next page starts a new visit.
update private.page_views set created_at = now() - interval '31 minutes';
set local role service_role;
select public.record_page_view('203.0.113.7', 'Browser A', '/discover', 'www.google.com', null,
  null, null, 'SE', 'desktop', 'Chrome', 'Windows');
reset role;
select results_eq(
  $$ select entry, referrer from private.page_views where path = '/discover' $$,
  $$ values (true, 'www.google.com'::text) $$,
  'a page after 30 minutes starts a new visit');

-- At most 300 page views an hour per visitor.
insert into private.page_views(created_at, visitor, visit, path, entry, device, browser, os)
select now() - interval '10 minutes', v.visitor, v.visit, '/', false, 'desktop', 'Chrome', 'Windows'
from (select visitor, visit from private.page_views where path = '/discover') v,
  generate_series(1, 299);
set local role service_role;
select is(
  public.record_page_view('203.0.113.7', 'Browser A', '/limit', null, null, null, null, null,
    'desktop', 'Chrome', 'Windows'),
  false, 'a visitor over 300 page views an hour is not recorded');
reset role;
select is_empty($$ select 1 from private.page_views where path = '/limit' $$,
  'nothing is recorded over the limit');

-- Totals for admins, from fixtures on fixed days.
delete from private.page_views;
insert into private.page_views(created_at, visitor, visit, path, entry, referrer, utm_source,
  utm_campaign, country, device, browser, os) values
  ('2026-01-01 10:00Z', decode(repeat('01', 16), 'hex'), 1, '/', true, 'news.ycombinator.com', null,
    null, 'SE', 'desktop', 'Chrome', 'Windows'),
  ('2026-01-01 10:05Z', decode(repeat('01', 16), 'hex'), 2, '/saas/x', false, null, null, null, 'SE',
    'desktop', 'Chrome', 'Windows'),
  ('2026-01-01 12:00Z', decode(repeat('02', 16), 'hex'), 3, '/', true, 'mail.google.com',
    'weekly-mail', 'launch', 'US', 'mobile', 'Safari', 'iOS'),
  ('2026-01-03 09:00Z', decode(repeat('03', 16), 'hex'), 4, '/stats', true, null, null, null, null,
    'desktop', 'Firefox', 'Linux'),
  ('2025-12-30 09:00Z', decode(repeat('04', 16), 'hex'), 5, '/', true, null, null, null, 'DE',
    'desktop', 'Chrome', 'macOS'),
  ('2026-01-04 00:00Z', decode(repeat('05', 16), 'hex'), 6, '/', true, null, null, null, 'DE',
    'desktop', 'Chrome', 'macOS'),
  (now() - interval '5 minutes', decode(repeat('06', 16), 'hex'), 7, '/', true, null, null, null,
    null, 'desktop', 'Chrome', 'macOS');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.admin_analytics('2026-01-01', '2026-01-04', 'day') $$,
  '42501', 'Only admins can do this', 'users cannot read the statistics');

select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000002', true);
create temp table stats as
  select public.admin_analytics('2026-01-01', '2026-01-04', 'day') as r;
select is(
  (select jsonb_build_object('visitors', r->'visitors', 'visits', r->'visits',
    'page_views', r->'page_views', 'previous', r->'previous', 'live', r->'live') from stats),
  '{"visitors": 3, "visits": 3, "page_views": 4, "live": 1,
    "previous": {"visitors": 1, "visits": 1, "page_views": 1}}'::jsonb,
  'totals for the period, the period before, and the last 30 minutes');
select is((select r->'series' from stats),
  '[{"start": "2026-01-01T00:00:00+00:00", "visitors": 2, "page_views": 3},
    {"start": "2026-01-02T00:00:00+00:00", "visitors": 0, "page_views": 0},
    {"start": "2026-01-03T00:00:00+00:00", "visitors": 1, "page_views": 1}]'::jsonb,
  'every day of the period, empty ones too');
select is((select r->'pages' from stats),
  '[{"path": "/", "visitors": 2, "page_views": 2}, {"path": "/saas/x", "visitors": 1, "page_views": 1},
    {"path": "/stats", "visitors": 1, "page_views": 1}]'::jsonb,
  'the most viewed pages');
select is((select r->'sources' from stats),
  '[{"source": null, "visits": 1}, {"source": "news.ycombinator.com", "visits": 1},
    {"source": "weekly-mail", "visits": 1}]'::jsonb,
  'sources: campaign tag, else the linking site, else direct');
select is((select r->'campaigns' from stats), '[{"campaign": "launch", "visits": 1}]'::jsonb,
  'campaigns');
select is((select r->'countries' from stats),
  '[{"country": "SE", "visitors": 1}, {"country": "US", "visitors": 1},
    {"country": null, "visitors": 1}]'::jsonb,
  'countries, unknown last');
select is((select r->'devices' from stats),
  '[{"device": "desktop", "visitors": 2}, {"device": "mobile", "visitors": 1}]'::jsonb,
  'devices');
select set_eq(
  $$ select e->>'os' from stats, jsonb_array_elements(r->'systems') e $$,
  $$ values ('Linux'), ('Windows'), ('iOS') $$,
  'operating systems');
select throws_ok(
  $$ select public.admin_analytics('2026-01-01', '2026-01-04', 'week') $$,
  'P0001', 'Choose hours, days or months', 'only hours, days or months');
select throws_ok(
  $$ select public.admin_analytics('2024-01-01', '2026-01-04', 'month') $$,
  'P0001', 'Choose a period of up to 400 days', 'at most 400 days');
reset role;

select ok(
  (select command like '%private.page_views%25 months%' from cron.job
   where jobname = 'harbor-analytics-retention'),
  'page views are deleted after 25 months');

select * from finish();
rollback;

-- Detailed site statistics: recording visits, page time and link clicks, how visits are named,
-- the periods, and every admin report. Runs in a rolled-back transaction, from no page views.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

delete from private.page_views;
delete from private.outbound_clicks;
delete from private.analytics_salts;

insert into auth.users(id, email, created_at) values
  ('e6000000-0000-4000-8000-000000000001', 'user@reports.test', now() - interval '1 minute'),
  ('e6000000-0000-4000-8000-000000000002', 'admin@reports.test', now() - interval '1 minute');
create temp table accounts as select count(*) as n from auth.users;
grant select on accounts to authenticated;
insert into private.admins(user_id) values ('e6000000-0000-4000-8000-000000000002');

-- Only the server records.
set local role anon;
select throws_ok(
  $$ select public.track_page_view('203.0.113.9', 'UA', '/', null, null, null, null, null, null,
     null, null, null, 'desktop', 'Chrome', null, 'Windows', null) $$,
  '42501', null, 'visitors cannot record page views directly');
select throws_ok($$ select public.track_engagement('203.0.113.9', 'UA', 1, 1000) $$,
  '42501', null, 'visitors cannot report page time directly');
select throws_ok(
  $$ select public.track_outbound_click('203.0.113.9', 'UA', '/', 'https://example.com/', 'example.com') $$,
  '42501', null, 'visitors cannot record link clicks directly');
reset role;

-- Visits, and what a visit's first page keeps.
set local role service_role;
create temp table ids(name text, id bigint);
grant all on ids to service_role;
insert into ids select 'first', public.track_page_view('203.0.113.9', 'Browser A', '/',
  'news.ycombinator.com', 'hn', 'social', 'launch', 'hero', 'banner', 'SE', 'Stockholm', 'sv',
  'desktop', 'Chrome', '140', 'Windows', '10');
insert into ids select 'second', public.track_page_view('203.0.113.9', 'Browser A', '/stats',
  'www.google.com', 'x', 'y', 'z', 'w', 'v', 'SE', 'Stockholm', 'sv', 'desktop', 'Chrome', '140',
  'Windows', '10');
insert into ids select 'other', public.track_page_view('203.0.113.9', 'Browser B', '/about', null,
  null, null, null, null, null, 'SE', null, 'en', 'mobile', 'Safari', '18', 'iOS', '18');
reset role;

select ok((select bool_and(id is not null) from ids), 'recording returns the page view id');
select results_eq(
  $$ select v.entry, v.visit = (select id from ids where name = 'first'), v.referrer, v.utm_term,
       v.utm_content, v.city, v.language, v.browser_version, v.os_version
     from private.page_views v order by v.id $$,
  $$ values (true, true, 'news.ycombinator.com'::text, 'hero'::text, 'banner'::text,
       'Stockholm'::text, 'sv'::text, '140'::text, '10'::text),
     (false, true, null, null, null, 'Stockholm', 'sv', '140', '10'),
     (true, false, null, null, null, null, 'en', '18', '18') $$,
  'a visit continues within 30 minutes, and only its first page keeps where it came from');

-- Page time: only the same visitor, never shorter, at most an hour.
set local role service_role;
select is(public.track_engagement('203.0.113.9', 'Browser A',
  (select id from ids where name = 'first'), 15000), true, 'the visitor reports page time');
select is(public.track_engagement('203.0.113.9', 'Browser B',
  (select id from ids where name = 'first'), 60000), false, 'another visitor cannot');
select public.track_engagement('203.0.113.9', 'Browser A', (select id from ids where name = 'first'), 5000);
reset role;
select is((select engaged_ms from private.page_views where id = (select id from ids where name = 'first')),
  15000, 'a later, shorter report does not shorten it');
set local role service_role;
select public.track_engagement('203.0.113.9', 'Browser A', (select id from ids where name = 'first'), 99999999);
reset role;
select is((select engaged_ms from private.page_views where id = (select id from ids where name = 'first')),
  3600000, 'page time is at most an hour');

-- Link clicks join the visit.
set local role service_role;
select is(public.track_outbound_click('203.0.113.9', 'Browser A', '/saas/x',
  'https://example.com/pricing', 'example.com'), true, 'the server records a link click');
reset role;
select results_eq(
  $$ select path, target, target_host, visit = (select id from ids where name = 'first')
     from private.outbound_clicks $$,
  $$ values ('/saas/x'::text, 'https://example.com/pricing'::text, 'example.com'::text, true) $$,
  'a link click keeps its page, its target and the visit');

-- Channels and source names.
select results_eq(
  $$ select private.analytics_channel(r, s, m) from (values
       ('news.ycombinator.com', null, null), ('www.google.com', null, null),
       ('google.co.uk', null, null), (null, 'newsletter', 'email'), (null, 'google', 'cpc'),
       ('chatgpt.com', null, null), (null, 'chatgpt.com', null), ('mail.google.com', null, null),
       ('example.org', null, null), (null, null, null)) t(r, s, m) $$,
  $$ values ('Organic social'::text), ('Organic search'), ('Organic search'), ('Email'), ('Paid'),
       ('AI assistants'), ('AI assistants'), ('Email'), ('Referral'), ('Direct') $$,
  'visits are grouped into channels, campaign tags first');
select results_eq(
  $$ select private.analytics_source(r, s) from (values
       ('t.co', null), ('google.se', null), ('news.ycombinator.com', null), (null, 'hn'),
       ('chatgpt.com', null), ('example.org', null), (null, 'Weekly'), (null, null)) t(r, s) $$,
  $$ values ('X'::text), ('Google'), ('Hacker News'), ('Hacker News'), ('ChatGPT'),
       ('example.org'), ('Weekly'), (null) $$,
  'known sites get their usual name, others keep their host or tag');

-- Periods.
select results_eq(
  $$ select bucket,
       period_from = (date_trunc('day', now() at time zone 'Europe/Stockholm') - interval '6 days')
         at time zone 'Europe/Stockholm',
       previous_from = (date_trunc('day', now() at time zone 'Europe/Stockholm') - interval '13 days')
         at time zone 'Europe/Stockholm',
       previous_to - previous_from = period_to - period_from, period_to = now()
     from private.analytics_period('7d', 'Europe/Stockholm', null) $$,
  $$ values ('day'::text, true, true, true, true) $$,
  '7 days: whole local days up to now, and the 7 days before');
select results_eq(
  $$ select (select bucket from private.analytics_period('24h', 'UTC', null)),
       (select bucket from private.analytics_period('30d', 'UTC', null)),
       (select bucket from private.analytics_period('12m', 'UTC', null)),
       (select bucket from private.analytics_period('all', 'UTC', now() - interval '10 hours')),
       (select bucket from private.analytics_period('all', 'UTC', now() - interval '10 days')),
       (select bucket from private.analytics_period('all', 'UTC', now() - interval '1 year')),
       (select bucket from private.analytics_period('all', 'UTC', now() - interval '3 years')) $$,
  $$ values ('hour'::text, 'day'::text, 'week'::text, 'hour'::text, 'day'::text, 'week'::text,
       'month'::text) $$,
  'each period has buckets that fit it');
select is((select previous_from from private.analytics_period('all', 'UTC', now() - interval '1 year')),
  null::timestamptz, 'all time has no period before it');
select throws_ok($$ select * from private.analytics_period('90d', 'UTC', null) $$, 'P0001',
  'Choose 24 hours, 7 days, 30 days, 12 months or all time', 'only the five periods');
select throws_ok($$ select * from private.analytics_period('7d', 'Nowhere/Nothing', null) $$,
  '22023', null, 'only real time zones');

-- Reports, from fixed visits in the last day.
delete from private.page_views;
delete from private.outbound_clicks;
insert into private.page_views(id, created_at, visitor, visit, path, entry, referrer, utm_source,
  utm_medium, utm_campaign, country, city, language, device, browser, browser_version, os,
  os_version, engaged_ms)
overriding system value values
  (901, now() - interval '3 hours', decode(repeat('01', 16), 'hex'), 901, '/', true,
    'news.ycombinator.com', null, null, null, 'SE', 'Stockholm', 'sv', 'desktop', 'Chrome', '140',
    'Windows', '10', null),
  (902, now() - interval '3 hours' + interval '2 minutes', decode(repeat('01', 16), 'hex'), 901,
    '/stats', false, null, null, null, null, 'SE', 'Stockholm', 'sv', 'desktop', 'Chrome', '140',
    'Windows', '10', null),
  (903, now() - interval '3 hours' + interval '5 minutes', decode(repeat('01', 16), 'hex'), 901,
    '/about', false, null, null, null, null, 'SE', 'Stockholm', 'sv', 'desktop', 'Chrome', '140',
    'Windows', '10', 30000),
  (904, now() - interval '2 hours', decode(repeat('02', 16), 'hex'), 904, '/', true, null,
    'newsletter', 'email', 'launch', 'US', null, 'en', 'mobile', 'Safari', '18', 'iOS', '18', 5000),
  (905, now() - interval '1 hour', decode(repeat('03', 16), 'hex'), 905, '/stats', true, null, null,
    null, null, null, null, null, 'desktop', 'Firefox', '142', 'Linux', null, null),
  (906, now() - interval '30 hours', decode(repeat('04', 16), 'hex'), 906, '/', true, null, null,
    null, null, 'DE', null, 'de', 'desktop', 'Chrome', '140', 'macOS', null, null);
insert into private.outbound_clicks(created_at, visitor, visit, path, target, target_host) values
  (now() - interval '2 hours', decode(repeat('02', 16), 'hex'), 904, '/saas/x',
    'https://example.com/', 'example.com'),
  (now() - interval '1 hour', decode(repeat('03', 16), 'hex'), 905, '/saas/x',
    'https://example.com/', 'example.com');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.admin_analytics_overview('24h', 'UTC') $$, '42501',
  'Only admins can do this', 'users cannot read the overview');
select throws_ok($$ select public.admin_analytics_breakdown('24h', 'UTC', 'page', 10) $$, '42501',
  'Only admins can do this', 'users cannot read breakdowns');
select throws_ok($$ select public.admin_analytics_live() $$, '42501', 'Only admins can do this',
  'users cannot read the live figures');
select throws_ok($$ select public.admin_analytics_platform('24h', 'UTC') $$, '42501',
  'Only admins can do this', 'users cannot read the platform figures');

select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000002', true);
create temp table overview as select public.admin_analytics_overview('24h', 'UTC') as r;
select is((select r->'totals' from overview),
  '{"visitors": 3, "visits": 3, "page_views": 5, "views_per_visit": 1.67, "bounce_rate": 66.7,
    "visit_duration": 111.7}'::jsonb,
  'totals: page time from reports, else the next page; bounces are one-page visits');
select is((select r->'previous'->>'visitors' from overview), '1', 'the day before has its own totals');
select is((select jsonb_array_length(r->'series') from overview), 24, '24 hours, by hour');
select is((select jsonb_array_length(r->'previous_series') from overview), 24,
  'the day before has as many hours');
select is((select sum((p->>'page_views')::integer) from overview, jsonb_array_elements(r->'series') p),
  5::bigint, 'every page view is in an hour');

create temp table b as select d, public.admin_analytics_breakdown('24h', 'UTC', d, 10) as r
from unnest(array['page', 'entry_page', 'exit_page', 'channel', 'source', 'utm_campaign', 'city',
  'browser_version', 'outbound']) d;
select is((select r->'rows' from b where d = 'page'),
  '[{"value": "/", "visitors": 2, "page_views": 2, "time_on_page": 62.5},
    {"value": "/stats", "visitors": 2, "page_views": 2, "time_on_page": 180.0},
    {"value": "/about", "visitors": 1, "page_views": 1, "time_on_page": 30.0}]'::jsonb,
  'pages: visitors, views and time on page');
select is((select r->'rows' from b where d = 'entry_page'),
  '[{"value": "/", "detail": null, "visitors": 2, "visits": 2, "bounce_rate": 50.0,
     "visit_duration": 167.5},
    {"value": "/stats", "detail": null, "visitors": 1, "visits": 1, "bounce_rate": 100.0,
     "visit_duration": 0.0}]'::jsonb,
  'entry pages: the visits they started');
select is((select r->'rows' from b where d = 'exit_page'),
  '[{"value": "/", "visitors": 1, "exits": 1, "exit_rate": 50.0},
    {"value": "/about", "visitors": 1, "exits": 1, "exit_rate": 100.0},
    {"value": "/stats", "visitors": 1, "exits": 1, "exit_rate": 50.0}]'::jsonb,
  'exit pages: the visits that ended there, and the share of views that were last');
select results_eq(
  $$ select e->>'value' from b, jsonb_array_elements(r->'rows') e where d = 'channel' $$,
  $$ values ('Direct'::text), ('Email'), ('Organic social') $$, 'channels');
select results_eq(
  $$ select e->>'value' from b, jsonb_array_elements(r->'rows') e where d = 'source' $$,
  $$ values ('Hacker News'::text), ('newsletter'), (null) $$, 'sources, direct last');
select is((select r->'rows' from b where d = 'utm_campaign'),
  '[{"value": "launch", "detail": null, "visitors": 1, "visits": 1, "bounce_rate": 100.0,
     "visit_duration": 5.0}]'::jsonb,
  'campaign tags list only tagged visits');
select results_eq(
  $$ select e->>'value', e->>'detail' from b, jsonb_array_elements(r->'rows') e
     where d = 'city' limit 1 $$,
  $$ values ('Stockholm'::text, 'SE'::text) $$, 'cities carry their country');
select results_eq(
  $$ select e->>'value' from b, jsonb_array_elements(r->'rows') e where d = 'browser_version' $$,
  $$ values ('Chrome 140'::text), ('Firefox 142'), ('Safari 18') $$, 'browsers with their version');
select is((select r->'rows' from b where d = 'outbound'),
  '[{"value": "https://example.com/", "detail": "example.com", "visitors": 2, "clicks": 2}]'::jsonb,
  'links to other sites, by clicks');
select results_eq(
  $$ select jsonb_array_length(r->'rows'), (r->>'total')::integer, (r->>'visitors')::integer
     from (select public.admin_analytics_breakdown('24h', 'UTC', 'page', 1) as r) t $$,
  $$ values (1, 3, 3) $$, 'a limit keeps the top rows and says how many there are');
select throws_ok($$ select public.admin_analytics_breakdown('24h', 'UTC', 'password', 10) $$,
  'P0001', 'Choose a breakdown', 'only the known breakdowns');

select is((select sum((c->>'page_views')::integer)
  from jsonb_array_elements(public.admin_analytics_heatmap('24h', 'UTC')->'cells') c), 5::bigint,
  'the weekday and hour map holds every page view');
select is(public.admin_analytics_behavior('24h', 'UTC') - 'range',
  '{"visits": 3, "time_on_page": 83.8,
    "pages": [{"key": "1", "visits": 2}, {"key": "2", "visits": 0}, {"key": "3-5", "visits": 1},
      {"key": "6-10", "visits": 0}, {"key": "11+", "visits": 0}],
    "durations": [{"key": "0-10s", "visits": 2}, {"key": "10-30s", "visits": 0},
      {"key": "30-60s", "visits": 0}, {"key": "1-3m", "visits": 0}, {"key": "3-10m", "visits": 1},
      {"key": "10-30m", "visits": 0}, {"key": "30m+", "visits": 0}]}'::jsonb,
  'visits by pages and by length');

create temp table platform as select public.admin_analytics_platform('24h', 'UTC') as r;
select ok((select (r->'totals'->>'sign_ups')::integer >= 2 from platform),
  'sign-ups in the period count new accounts');
select is((select (r->'totals'->>'conversion_rate')::numeric from platform),
  (select round(100.0 * (r->'totals'->>'sign_ups')::integer / 3, 2) from platform),
  'sign-ups per 100 visitors');
select is((select (r->'now'->>'users')::bigint from platform), (select n from accounts),
  'the totals now count every account');
select is((select jsonb_array_length(r->'series') from platform), 24, 'platform figures by hour');

-- Live: the last minutes only.
reset role;
insert into private.page_views(created_at, visitor, visit, path, entry, device, browser, os)
values (now() - interval '2 minutes', decode(repeat('05', 16), 'hex'), 1, '/pricing', true,
  'desktop', 'Chrome', 'Windows');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000002', true);
create temp table live as select public.admin_analytics_live() as r;
select results_eq(
  $$ select (r->>'current')::integer, (r->>'visitors')::integer, (r->>'page_views')::integer,
       jsonb_array_length(r->'minutes'), r->'pages'->0->>'value' from live $$,
  $$ values (1, 1, 1, 30, '/pricing'::text) $$,
  'live: visitors now, the last 30 minutes by minute, and their pages');
reset role;

select ok(
  (select command like '%private.outbound_clicks%25 months%' from cron.job
   where jobname = 'harbor-analytics-retention'),
  'link clicks are deleted after 25 months too');

select * from finish();
rollback;

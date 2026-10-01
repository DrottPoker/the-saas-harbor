-- Site statistics: who may record and read page views, the daily visitor hash, visits, the limit
-- and the retention job; analytics_reports.test.sql covers the reports. Runs in a rolled-back
-- transaction, and starts from no page views so local browsing does not change the figures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
  $$ select public.track_page_view('203.0.113.7', 'UA', '/', null, null, null, null, null, null,
     null, null, null, 'desktop', 'Chrome', null, 'Windows', null) $$,
  '42501', null, 'visitors cannot record page views directly');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.track_page_view('203.0.113.7', 'UA', '/', null, null, null, null, null, null,
     null, null, null, 'desktop', 'Chrome', null, 'Windows', null) $$,
  '42501', null, 'users cannot record page views directly');
select throws_ok($$ select * from private.page_views $$, '42501', null,
  'users cannot read page views');
reset role;

set local role service_role;
select isnt(
  public.track_page_view('203.0.113.7', 'Browser A', '/', 'news.ycombinator.com', 'newsletter',
    'email', 'launch', null, null, 'SE', null, null, 'desktop', 'Chrome', null, 'Windows', null),
  null, 'the server records a page view');
select public.track_page_view('203.0.113.7', 'Browser A', '/stats', 'news.ycombinator.com',
  'newsletter', 'email', 'launch', null, null, 'SE', null, null, 'desktop', 'Chrome', null,
  'Windows', null);
select public.track_page_view('203.0.113.7', 'Browser B', '/about', null, null, null, null, null,
  null, 'SE', null, null, 'mobile', 'Safari', null, 'iOS', null);
select throws_ok(
  $$ select public.track_page_view('203.0.113.7', 'Browser A', 'no-slash', null, null, null, null,
     null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null) $$,
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
select public.track_page_view('203.0.113.7', 'Browser A', '/discover', 'www.google.com', null,
  null, null, null, null, 'SE', null, null, 'desktop', 'Chrome', null, 'Windows', null);
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
  public.track_page_view('203.0.113.7', 'Browser A', '/limit', null, null, null, null, null, null,
    null, null, null, 'desktop', 'Chrome', null, 'Windows', null),
  null, 'a visitor over 300 page views an hour is not recorded');
reset role;
select is_empty($$ select 1 from private.page_views where path = '/limit' $$,
  'nothing is recorded over the limit');

-- The first version's functions are gone (migration 20261001200000).
select hasnt_function('public', 'record_page_view', 'recording goes through track_page_view only');
select hasnt_function('public', 'admin_analytics', 'reports go through the admin_analytics_* functions');

select ok(
  (select command like '%private.page_views%25 months%' from cron.job
   where jobname = 'harbor-analytics-retention'),
  'page views are deleted after 25 months');

select * from finish();
rollback;

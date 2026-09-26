-- A product's page views for its founder: which page views count for a product, the founder's
-- own and hidden products left out, who reads the counts, the periods, and that they go with the
-- product and the account. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

delete from private.page_views;
delete from private.analytics_salts;

insert into auth.users(id) values
  ('e7000000-0000-4000-8000-000000000001'),
  ('e7000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
select public.save_saas('e8000000-0000-4000-8000-000000000001', 'Viewcount Alpha',
  'View fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select public.save_saas('e8000000-0000-4000-8000-000000000002', 'Viewcount Beta',
  'View fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select public.save_saas('e8000000-0000-4000-8000-000000000003', 'Viewcount Gamma',
  'View fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
reset role;

-- A visitor, another signed-in user and the founder view the product's page; other pages under
-- /saas and unknown products count for none.
set local role service_role;
select public.track_page_view('203.0.113.7', 'Visitor', '/saas/viewcount-alpha', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
select public.track_page_view('203.0.113.7', 'Other user', '/saas/viewcount-alpha', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null,
  'e7000000-0000-4000-8000-000000000002'::uuid);
select public.track_page_view('203.0.113.7', 'Founder', '/saas/viewcount-alpha', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null,
  'e7000000-0000-4000-8000-000000000001'::uuid);
select public.track_page_view('203.0.113.7', 'Visitor', '/saas/viewcount-alpha/badge.svg', null,
  null, null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
select public.track_page_view('203.0.113.7', 'Visitor', '/saas/viewcount-missing', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
select public.track_page_view('203.0.113.7', 'Visitor', '/saas/viewcount-beta', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
reset role;

select results_eq(
  $$ select saas_id, day, views from private.saas_page_views
     where saas_id::text like 'e8000000-%' order by saas_id $$,
  $$ values ('e8000000-0000-4000-8000-000000000001'::uuid, (now() at time zone 'UTC')::date, 2),
     ('e8000000-0000-4000-8000-000000000002', (now() at time zone 'UTC')::date, 1) $$,
  'a view of a product''s page counts for it, except the founder''s own');
select is((select count(*) from private.page_views), 6::bigint,
  'every one of them still counts for the site');

-- Only what visitors can see there counts.
update public.saas set hidden_at = now(), hidden_reason = 'spam'
  where id = 'e8000000-0000-4000-8000-000000000002';
set local role service_role;
select public.track_page_view('203.0.113.7', 'Visitor', '/saas/viewcount-beta', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
reset role;
select is((select views from private.saas_page_views
  where saas_id = 'e8000000-0000-4000-8000-000000000002'), 1, 'a hidden product counts no views');
update public.saas set hidden_at = null, hidden_reason = null
  where id = 'e8000000-0000-4000-8000-000000000002';

update public.profiles set suspended_at = now(), suspended_reason = 'spam'
  where id = 'e7000000-0000-4000-8000-000000000001';
set local role service_role;
select public.track_page_view('203.0.113.7', 'Visitor', '/saas/viewcount-alpha', null, null,
  null, null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
reset role;
select is((select views from private.saas_page_views
  where saas_id = 'e8000000-0000-4000-8000-000000000001'), 2,
  'neither does a product of a suspended account');
update public.profiles set suspended_at = null, suspended_reason = null
  where id = 'e7000000-0000-4000-8000-000000000001';

-- A view over the visitor's hourly limit is not recorded, so it does not count either.
insert into private.page_views(visitor, visit, path, entry, device, browser, os)
select private.analytics_visitor('203.0.113.8', 'Busy'), 1, '/', false, 'desktop', 'Chrome',
  'Windows'
from generate_series(1, 300);
set local role service_role;
select public.track_page_view('203.0.113.8', 'Busy', '/saas/viewcount-alpha', null, null, null,
  null, null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);
reset role;
select is((select views from private.saas_page_views
  where saas_id = 'e8000000-0000-4000-8000-000000000001'), 2,
  'a view over the hourly limit does not count');

-- The periods end today (UTC): 7 days, 30 days and everything.
insert into private.saas_page_views(saas_id, day, views)
select 'e8000000-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - d.back, d.views
from (values (6, 3), (7, 5), (29, 7), (30, 11)) d(back, views);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select * from public.saas_page_view_counts('e8000000-0000-4000-8000-000000000001') $$,
  $$ values (5::bigint, 17::bigint, 28::bigint) $$,
  'the founder reads the last 7 days, the last 30 days and all time');
select results_eq(
  $$ select * from public.saas_page_view_counts('e8000000-0000-4000-8000-000000000003') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'a product without views has none');
select throws_ok($$ select * from private.saas_page_views $$, '42501', null,
  'makers cannot read the counts directly');
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.saas_page_view_counts('e8000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'another user cannot read them');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select * from public.saas_page_view_counts('e8000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'visitors cannot read them');
reset role;

-- The counts go with the product, and with the account that owns it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
delete from public.saas where id = 'e8000000-0000-4000-8000-000000000001';
reset role;
select is((select count(*) from private.saas_page_views
  where saas_id = 'e8000000-0000-4000-8000-000000000001'), 0::bigint,
  'deleting a product deletes its counts');
delete from auth.users where id = 'e7000000-0000-4000-8000-000000000001';
select is((select count(*) from private.saas_page_views where saas_id::text like 'e8000000-%'),
  0::bigint, 'deleting the account deletes the counts of its products');

select * from finish();
rollback;

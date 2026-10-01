-- Where accounts come from: a new account keeps the source of the visit that led to it, matched on
-- the day's visitor hash; the funnel by source, the accounts that stopped at a step and an
-- account's page read it; deleting the account deletes it. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id, email, created_at, email_confirmed_at) values
  ('ea000000-0000-4000-8000-000000000001', 'new@sources.test', now() - interval '5 minutes',
    now() - interval '4 minutes'),
  ('ea000000-0000-4000-8000-000000000002', 'old@sources.test', now() - interval '2 hours', null),
  ('ea000000-0000-4000-8000-000000000003', 'unseen@sources.test', now() - interval '5 minutes',
    null),
  ('ea000000-0000-4000-8000-000000000009', 'admin@sources.test', now() - interval '1 day', now());
insert into public.profiles(id, name) values
  ('ea000000-0000-4000-8000-000000000001', 'Sources New'),
  ('ea000000-0000-4000-8000-000000000009', 'Sources Admin');
insert into private.admins(user_id) values ('ea000000-0000-4000-8000-000000000009');

-- The browser's visits today: one from a Reddit campaign three hours ago, and the current one
-- without a source. The visit that came from somewhere wins.
insert into private.page_views(id, created_at, visitor, visit, path, entry, referrer, utm_source,
  utm_medium, utm_campaign, device, browser, os)
overriding system value
select v.id, now() - interval '3 hours', private.analytics_visitor('198.51.100.7', 'Sources UA'),
  v.id, '/list-your-saas', true, 'reddit.com', null, null, 'launch-sources', 'desktop', 'Chrome',
  'Windows'
from (select nextval(pg_get_serial_sequence('private.page_views', 'id')::regclass) as id) v;
set local role service_role;
select public.track_page_view('198.51.100.7', 'Sources UA', '/pricing', null, null, null, null,
  null, null, null, null, null, 'desktop', 'Chrome', null, 'Windows', null);

-- Only the server records, once, within an hour of the account's creation.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.record_account_source('ea000000-0000-4000-8000-000000000001', '198.51.100.7', 'Sources UA') $$,
  '42501', null, 'users cannot record a source');
set local role service_role;
select ok(public.record_account_source('ea000000-0000-4000-8000-000000000001', '198.51.100.7',
  'Sources UA'), 'a new account gets the source of its visit');
select ok(not public.record_account_source('ea000000-0000-4000-8000-000000000001',
  '198.51.100.7', 'Sources UA'), 'an account gets a source once');
select ok(not public.record_account_source('ea000000-0000-4000-8000-000000000002',
  '198.51.100.7', 'Sources UA'), 'an account older than an hour gets none');
select ok(not public.record_account_source('ea000000-0000-4000-8000-000000000003',
  '198.51.100.7', 'Another UA'), 'a browser without visits today gives none');
reset role;
select results_eq(
  $$ select entry_path, referrer, utm_campaign
     from private.account_sources where user_id = 'ea000000-0000-4000-8000-000000000001' $$,
  $$ values ('/list-your-saas'::text, 'reddit.com'::text, 'launch-sources'::text) $$,
  'the visit that came from somewhere wins over a later direct one');
-- Nothing in it finds the visit's page views in the site statistics, such as when it began.
select columns_are('private', 'account_sources', array['user_id', 'entry_path', 'referrer',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'recorded_at'],
  'a source keeps where the visit came from, and nothing that ties it to the statistics');

-- The funnel by source, on the accounts moved to a quiet day of their own.
update auth.users set created_at = '2001-02-01 00:00+00',
  email_confirmed_at = '2001-02-01 01:00+00'
where id in ('ea000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000003');
update auth.users set email_confirmed_at = null
where id = 'ea000000-0000-4000-8000-000000000003';
select is(private.funnel_sources('2001-02-01 00:00+00', '2001-02-02 00:00+00', 'channel'),
  jsonb_build_object('accounts', 2, 'known', 1, 'rows', jsonb_build_array(
    jsonb_build_object('known', true, 'value', 'Organic social', 'accounts', 1, 'confirmed', 1,
      'product', 0, 'verified', 0, 'ranked', 0),
    jsonb_build_object('known', false, 'value', null, 'accounts', 1, 'confirmed', 0,
      'product', 0, 'verified', 0, 'ranked', 0))),
  'the funnel by channel, with accounts without a source as one row');
select is(private.funnel_sources('2001-02-01 00:00+00', '2001-02-02 00:00+00', 'source')
    -> 'rows' -> 0 ->> 'value', 'Reddit', 'the funnel by source names the site');
select is(private.funnel_sources('2001-02-01 00:00+00', '2001-02-02 00:00+00', 'campaign')
    -> 'rows' -> 0 ->> 'value', 'launch-sources', 'the funnel by campaign');
select is(private.funnel_sources('2001-02-01 00:00+00', '2001-02-02 00:00+00', 'entry_page')
    -> 'rows' -> 0 ->> 'value', '/list-your-saas', 'the funnel by first page');

-- Admins read the reports and the accounts; users cannot.
set local role authenticated;
select throws_ok($$ select public.admin_analytics_sources('30d', 'UTC', 'channel') $$, '42501',
  'Only admins can do this', 'users cannot read the funnel by source');
select throws_ok($$ select * from public.admin_funnel_accounts('30d', 'UTC', 'product') $$,
  '42501', 'Only admins can do this', 'users cannot list the accounts of a step');
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000009', true);
select throws_ok($$ select public.admin_analytics_sources('30d', 'UTC', 'country') $$, 'P0001',
  null, 'an unknown grouping is refused');
select ok(exists (select 1 from public.admin_funnel_accounts('24h', 'UTC', 'signed_up')
    where email = 'old@sources.test')
  and not exists (select 1 from public.admin_funnel_accounts('24h', 'UTC', 'confirmed')
    where email = 'old@sources.test'),
  'an account is listed at its last step only');
select results_eq(
  $$ select source_channel, source_name, source_campaign, source_entry_path
     from public.admin_account('ea000000-0000-4000-8000-000000000001') $$,
  $$ values ('Organic social'::text, 'Reddit'::text, 'launch-sources'::text,
    '/list-your-saas'::text) $$,
  'an account''s page shows where it came from');

-- Deleting the account deletes its source.
reset role;
delete from auth.users where id = 'ea000000-0000-4000-8000-000000000001';
select is_empty($$ select 1 from private.account_sources
  where user_id = 'ea000000-0000-4000-8000-000000000001' $$,
  'deleting an account deletes its source');

select * from finish();
rollback;

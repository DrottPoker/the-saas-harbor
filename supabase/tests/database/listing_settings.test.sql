-- Listing policy is public, admin-only to change, and enforced for direct API writes too.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users(id, email) values
  ('ec000000-0000-4000-8000-000000000001', 'maker@listing-settings.test'),
  ('ec000000-0000-4000-8000-000000000002', 'admin@listing-settings.test'),
  ('ec000000-0000-4000-8000-000000000003', 'reader@listing-settings.test');
insert into public.profiles(id, name) values
  ('ec000000-0000-4000-8000-000000000001', 'Listing Maker'),
  ('ec000000-0000-4000-8000-000000000002', 'Listing Admin'),
  ('ec000000-0000-4000-8000-000000000003', 'Listing Reader');
insert into private.admins(user_id) values ('ec000000-0000-4000-8000-000000000002');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.listing_settings(), true, 'Other is offered by default');
select throws_ok($$ select public.admin_update_listing_settings(false) $$, '42501', null,
  'visitors cannot change the policy');
set local role service_role;
select throws_ok($$ select public.admin_update_listing_settings(false) $$, '42501', null,
  'the service role cannot change the policy');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.admin_update_listing_settings(false) $$, '42501', null,
  'ordinary users cannot change the policy');
select throws_ok($$ select * from private.listing_settings $$, '42501', null,
  'the settings table is not accessible');
select public.save_saas('ec100000-0000-4000-8000-000000000001', 'Existing Listing', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
  true, false, false, '{}', 'Unsupported provider', 'other');

select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.admin_update_listing_settings(false) $$, 'admins can hide Other');
select is(public.listing_settings(), false, 'the policy persists');
select throws_ok($$ select public.admin_update_listing_settings(null) $$, '22023', null,
  'null is not a valid policy');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.public_saas where id = 'ec100000-0000-4000-8000-000000000001'),
  1::bigint, 'existing listings remain public');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.save_saas('ec100000-0000-4000-8000-000000000002', 'Refused Listing',
  'Fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null,
  null, true, false, false, '{}', 'Unsupported provider', 'other') $$,
  'P0001', 'Connect a supported payment provider to list your SaaS', 'Other is rejected by the RPC');
select is((select count(*) from public.saas where id = 'ec100000-0000-4000-8000-000000000002'),
  0::bigint, 'a refused save is atomic');

select public.save_saas('ec100000-0000-4000-8000-000000000003', 'Pending Listing', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
  true, false, false, '{}', null, 'stripe');
select is((select listing_pending from public.saas where id = 'ec100000-0000-4000-8000-000000000003'),
  true, 'choosing a provider alone does not publish the product');
select throws_ok($$ update public.saas set listing_pending = false
  where id = 'ec100000-0000-4000-8000-000000000003' $$, '42501', null,
  'founders cannot bypass publication');
select throws_ok($$ update public.saas_settings set other_provider = 'Other'
  where saas_id = 'ec100000-0000-4000-8000-000000000003' $$,
  'P0001', 'Connect a supported payment provider to list your SaaS', 'direct settings writes obey the policy');
update public.saas set name = 'Renamed Pending Listing' where id = 'ec100000-0000-4000-8000-000000000003';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.saas where id = 'ec100000-0000-4000-8000-000000000003'),
  0::bigint, 'pending products are private');
select is((select count(*) from public.public_saas where id = 'ec100000-0000-4000-8000-000000000003'),
  0::bigint, 'public pages and lists exclude pending products');
select is(public.saas_slug_redirect('pending-listing'), null, 'redirects do not disclose pending products');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.saas where id = 'ec100000-0000-4000-8000-000000000003'),
  0::bigint, 'other signed-in users cannot read a pending product');
select throws_ok($$ select public.submit_report('saas', 'ec100000-0000-4000-8000-000000000003', 'spam', '') $$,
  'P0001', 'This product could not be found', 'reports cannot disclose a pending product');
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.saas where id = 'ec100000-0000-4000-8000-000000000003'),
  1::bigint, 'admins can read pending products');

set local role service_role;
select public.record_revenue_verification('ec100000-0000-4000-8000-000000000003', 'stripe',
  'v1:fixture', 'rk_live_fixture', true, 0, 0, '{}', null, '{}', null, null, null, null);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.public_saas where id = 'ec100000-0000-4000-8000-000000000003'),
  1::bigint, 'a successful connection publishes even with zero revenue');
select is(public.saas_slug_redirect('pending-listing'), 'renamed-pending-listing',
  'redirects work after publication');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000001', true);
insert into public.saas(id, owner_id, name, tagline, description, category, website)
values ('ec100000-0000-4000-8000-000000000004', 'ec000000-0000-4000-8000-000000000001',
  'Direct Listing', 'Fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com');
select is((select listing_pending from public.saas where id = 'ec100000-0000-4000-8000-000000000004'),
  true, 'direct inserts also need a connection');
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.admin_update_listing_settings(true) $$, 'admins can offer Other again');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.listing_settings(), true, 'the enabled policy is public');
select is((select count(*) from public.public_saas where id = 'ec100000-0000-4000-8000-000000000004'),
  0::bigint, 'enabling Other does not publish pending products by itself');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000001', true);
select public.save_saas('ec100000-0000-4000-8000-000000000004', 'Direct Listing', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
  true, false, false, '{}', 'Unsupported provider', 'other');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.public_saas where id = 'ec100000-0000-4000-8000-000000000004'),
  1::bigint, 'choosing Other publishes when allowed again');
set local role postgres;
update public.saas set hidden_at = now(), hidden_reason = 'spam'
  where id = 'ec100000-0000-4000-8000-000000000003';
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.public_saas where id = 'ec100000-0000-4000-8000-000000000003'),
  0::bigint, 'publication still respects moderation');
select is((select count(*) from public.leaderboard where id = 'ec100000-0000-4000-8000-000000000004'),
  0::bigint, 'Other never grants a verified rank');

select * from finish();
rollback;

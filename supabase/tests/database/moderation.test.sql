-- Reports, admin decisions, hidden products, suspended accounts and product limits. Runs in a
-- rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(94);

-- Makers, a reporter, a bystander and two admins. The maker has two products, experience and a
-- verified MRR on the leaderboard, and has written to the reporter.
insert into auth.users(id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'maker@moderation.test'),
  ('d0000000-0000-4000-8000-000000000002', 'reporter@moderation.test'),
  ('d0000000-0000-4000-8000-000000000003', 'bystander@moderation.test'),
  ('d0000000-0000-4000-8000-000000000004', 'admin@moderation.test'),
  ('d0000000-0000-4000-8000-000000000005', 'second-admin@moderation.test');
insert into public.profiles(id, name) values
  ('d0000000-0000-4000-8000-000000000001', 'Moderation Maker'),
  ('d0000000-0000-4000-8000-000000000002', 'Moderation Reporter'),
  ('d0000000-0000-4000-8000-000000000003', 'Moderation Bystander'),
  ('d0000000-0000-4000-8000-000000000004', 'Moderation Admin'),
  ('d0000000-0000-4000-8000-000000000005', 'Second Admin');
insert into public.profile_experience(profile_id, title, organization, starts_on)
  values ('d0000000-0000-4000-8000-000000000001', 'Founder', 'Moderation Co', '2024-01-01');
insert into private.admins(user_id) values
  ('d0000000-0000-4000-8000-000000000004'), ('d0000000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select public.save_saas('e0000000-0000-4000-8000-000000000001', 'Moderation Product',
  'Reported fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, true, false, false);
select public.save_saas('e0000000-0000-4000-8000-000000000002', 'Second Product',
  'Another fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select public.send_message('d0000000-0000-4000-8000-000000000002', 'Buy my course now');
set local role service_role;
select public.record_revenue_verification('e0000000-0000-4000-8000-000000000001', 'stripe', 'v1:moderation',
  'rk_live_…mod1', true, 5000, 3, '{"usd": 5000}', null, array[repeat('f', 64)], null, null, null);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select public.send_message('d0000000-0000-4000-8000-000000000001', 'Hello from the reporter');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select public.send_message('d0000000-0000-4000-8000-000000000002', 'Last chance to buy');

-- Admin rights: only rows in private.admins, never reachable from the API.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.is_admin(), false, 'visitors are never admins');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select is(public.is_admin(), false, 'makers are not admins');
select throws_ok('select count(*) from private.admins', '42501', null,
  'makers cannot read the admin list');
select throws_ok($$ select public.set_admin('reporter@moderation.test', true) $$, '42501', null,
  'makers cannot grant admin rights');
select throws_ok(
  $$ select public.admin_hide_saas('e0000000-0000-4000-8000-000000000001', 'spam', 'No', null) $$,
  '42501', 'Only admins can do this', 'makers cannot hide products');
select throws_ok($$ select * from public.admin_accounts('', 'all') $$, '42501',
  'Only admins can do this', 'makers cannot list accounts');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select is(public.is_admin(), true, 'admins are recognized');
set local role service_role;
select is(public.set_admin(' BYSTANDER@moderation.test ', true),
  'd0000000-0000-4000-8000-000000000003'::uuid, 'the service role grants admin rights by email');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select is(public.is_admin(), true, 'granted rights apply at once');
set local role service_role;
select public.set_admin('bystander@moderation.test', false);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select is(public.is_admin(), false, 'removed rights apply at once');

-- Makers write only the fields they edit.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ update public.saas set hidden_at = null where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'owners cannot change the moderation state of a product');
select throws_ok(
  $$ update public.profiles set suspended_at = null where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'makers cannot change the moderation state of their profile');
select throws_ok(
  $$ insert into public.saas(id, owner_id, name, tagline, description, category, website, created_at)
    values (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', 'Pinned', 'Future fixture',
      'A product dated into the future.', 'Other', 'https://example.com', '2099-01-01') $$,
  '42501', null, 'makers cannot date a product into the future');
select lives_ok(
  $$ update public.saas set tagline = 'Edited directly' where id = 'e0000000-0000-4000-8000-000000000002' $$,
  'owners still edit their product details');

-- Reports: signed-in users report what they can see, never their own content.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000001', 'spam', '') $$,
  '42501', null, 'visitors cannot send reports');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select is(public.unread_message_count(), 1, 'the reporter has an unread message from the maker');
select lives_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000001', 'misleading',
    '  The revenue claims are false.  ') $$,
  'a maker reports a product');
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000001', 'spam', '') $$,
  'P0001', 'You already reported this, and it is waiting for review',
  'one open report per reporter and product');
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000002', 'illegal', '  ') $$,
  'P0001', 'Describe the problem so it can be reviewed', 'illegal content needs an explanation');
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000002', 'boring', 'x') $$,
  'P0001', 'Choose a reason', 'reasons come from a fixed list');
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000002', 'spam',
    repeat('x', 1001)) $$,
  'P0001', 'Keep the details under 1,000 characters', 'details are at most 1,000 characters');
select throws_ok(
  $$ select public.submit_report('message',
    (select id from public.messages where body = 'Hello from the reporter'), 'spam', '') $$,
  'P0001', 'You cannot report your own message', 'makers cannot report their own messages');
select lives_ok(
  $$ select public.submit_report('message',
    (select id from public.messages where body = 'Buy my course now'), 'spam', '') $$,
  'a maker reports a message they received');
select lives_ok(
  $$ select public.submit_report('profile', 'd0000000-0000-4000-8000-000000000001',
    'impersonation', 'Uses the name of a well-known founder.') $$,
  'a maker reports a profile');
select lives_ok(
  $$ select public.submit_report('profile', 'd0000000-0000-4000-8000-000000000003', 'other',
    'Not sure about this one.') $$,
  'a maker reports another profile');
select lives_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000002', 'spam', '') $$,
  'a maker reports the second product');
select results_eq(
  $$ select content ->> 'body', details from public.reports where target = 'message' $$,
  $$ values ('Buy my course now'::text, ''::text) $$,
  'a message report keeps a copy of the message');
select is(
  (select details from public.reports where saas_id = 'e0000000-0000-4000-8000-000000000001'),
  'The revenue claims are false.', 'details are trimmed');
select is((select count(*)::int from public.reports), 5, 'reporters follow their own reports');
select throws_ok(
  $$ update public.reports set status = 'dismissed' $$,
  '42501', null, 'reporters cannot change reports');
select throws_ok(
  $$ insert into public.reports(reporter_id, subject_id, target, reason, content)
    values ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
      'profile', 'spam', '{}') $$,
  '42501', null, 'reports are written only through submit_report');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select is_empty('select 1 from public.reports', 'the reported maker never sees the reports');
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000001', 'spam', '') $$,
  'P0001', 'You cannot report your own product', 'makers cannot report their own product');
select throws_ok(
  $$ select public.submit_report('profile', 'd0000000-0000-4000-8000-000000000001', 'spam', '') $$,
  'P0001', 'You cannot report yourself', 'makers cannot report themselves');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select is_empty('select 1 from public.reports', 'other makers cannot see the reports');
select throws_ok(
  $$ select public.submit_report('message',
    'd0000000-0000-4000-8000-00000000ffff', 'spam', '') $$,
  'P0001', 'This message could not be found', 'unknown messages cannot be reported');
reset role;
create temp table pgtap_message as
  select id from public.messages
  where body = 'Buy my course now' and sender_id = 'd0000000-0000-4000-8000-000000000001';
grant select on pgtap_message to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.submit_report('message', (select id from pgtap_message), 'spam', '') $$,
  'P0001', 'This message could not be found',
  'only a participant can report a message');

-- Ten reports in an hour is the limit.
reset role;
insert into public.reports(reporter_id, subject_id, target, reason, content, status, resolved_at)
select 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'profile',
  'spam', '{}', 'dismissed', now()
from generate_series(1, 10);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.submit_report('saas', 'e0000000-0000-4000-8000-000000000001', 'spam', '') $$,
  'P0001', 'You have sent many reports. Try again later', 'reports are rate limited');

-- An admin hides the reported product. It disappears for everyone but its owner and admins.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.reports where reporter_id = 'd0000000-0000-4000-8000-000000000002'),
  5, 'admins see every report');
select throws_ok(
  $$ select public.admin_hide_saas('e0000000-0000-4000-8000-000000000002', 'spam', '   ', null) $$,
  'P0001', 'Explain the decision. The maker sees this explanation',
  'hiding a product needs an explanation for the maker');
select throws_ok(
  $$ select public.admin_hide_saas('e0000000-0000-4000-8000-000000000002', 'spam', 'Spam.',
    (select id from public.reports where subject_id = 'd0000000-0000-4000-8000-000000000003' and status = 'open')) $$,
  'P0001', 'This report is about another maker', 'a decision answers a report about the same maker');
select lives_ok(
  $$ select public.admin_hide_saas('e0000000-0000-4000-8000-000000000001', 'misleading',
    '  The revenue claims in the description are false.  ',
    (select id from public.reports where saas_id = 'e0000000-0000-4000-8000-000000000001')) $$,
  'an admin hides a product');
select throws_ok(
  $$ select public.admin_hide_saas('e0000000-0000-4000-8000-000000000001', 'spam', 'Again.', null) $$,
  'P0001', 'This product is already hidden', 'a hidden product cannot be hidden twice');
select is(
  (select status from public.reports where saas_id = 'e0000000-0000-4000-8000-000000000001'),
  'actioned', 'hiding answers the open reports about the product');
select results_eq(
  $$ select action, target_label, reason::text, note from public.moderation_log
    where saas_id = 'e0000000-0000-4000-8000-000000000001' $$,
  $$ values ('hide_saas'::text, 'Moderation Product'::text, 'misleading'::text,
    'The revenue claims in the description are false.'::text) $$,
  'the decision is logged with its reason and explanation');
select isnt_empty(
  $$ select 1 from public.saas where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'admins still see hidden products');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is_empty($$ select 1 from public.public_saas where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a hidden product leaves the public listings');
select is_empty($$ select 1 from public.leaderboard where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a hidden product leaves the leaderboard');
select is_empty($$ select 1 from public.saas where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a hidden product cannot be read directly');
select is_empty($$ select 1 from public.public_metrics where saas_id = 'e0000000-0000-4000-8000-000000000001' $$,
  'the figures of a hidden product are hidden too');
select isnt_empty($$ select 1 from public.public_saas where id = 'e0000000-0000-4000-8000-000000000002' $$,
  'the maker''s other products stay listed');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select is_empty($$ select 1 from public.saas where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'signed-in makers cannot see a hidden product either');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select hidden_reason::text, hidden_note from public.saas where id = 'e0000000-0000-4000-8000-000000000001' $$,
  $$ values ('misleading'::text, 'The revenue claims in the description are false.'::text) $$,
  'the owner sees the product with the reason and explanation');
select public.save_saas('e0000000-0000-4000-8000-000000000001', 'Moderation Product',
  'Edited fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, true, false, false);
select is(
  (select hidden_at is not null from public.saas where id = 'e0000000-0000-4000-8000-000000000001'),
  true, 'editing a hidden product does not show it again');
select is_empty('select 1 from public.moderation_log', 'makers cannot read the moderation log');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$ select public.admin_restore_saas('e0000000-0000-4000-8000-000000000001', 'Fixed after review.') $$,
  'an admin restores the product');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select isnt_empty($$ select 1 from public.leaderboard where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a restored product is ranked again');

-- An admin suspends the maker. The profile, experience, products and messages disappear for
-- everyone else, and the account can neither send nor receive messages.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$ select public.admin_suspend_account('d0000000-0000-4000-8000-000000000004', 'spam', 'No.', null) $$,
  'P0001', 'You cannot suspend your own account', 'admins cannot suspend themselves');
select throws_ok(
  $$ select public.admin_suspend_account('d0000000-0000-4000-8000-000000000005', 'spam', 'No.', null) $$,
  'P0001', 'Remove admin rights before suspending this account', 'admins cannot suspend other admins');
select lives_ok(
  $$ select public.admin_suspend_account('d0000000-0000-4000-8000-000000000001', 'spam',
    'Sent the same advertisement to many makers.',
    (select id from public.reports where target = 'message'
      and reporter_id = 'd0000000-0000-4000-8000-000000000002')) $$,
  'an admin suspends an account');
select is(
  (select count(*)::int from public.reports
    where subject_id = 'd0000000-0000-4000-8000-000000000001' and status = 'open'),
  0, 'a suspension answers every open report about the maker');
select isnt_empty($$ select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000001' $$,
  'admins still see suspended profiles');
select results_eq(
  $$ select email, products, suspended_at is not null from public.admin_accounts('MODERATION maker', 'suspended') $$,
  $$ values ('maker@moderation.test'::text, 2, true) $$,
  'admins find accounts by name, with their products and status');
select results_eq(
  $$ select name from public.admin_accounts('moderation.test', 'admins') $$,
  $$ values ('Moderation Admin'::text), ('Second Admin'::text) $$,
  'admins filter the accounts that are admins');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is_empty($$ select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000001' $$,
  'a suspended profile is hidden');
select is_empty($$ select 1 from public.profile_experience where profile_id = 'd0000000-0000-4000-8000-000000000001' $$,
  'a suspended maker''s experience is hidden');
select is_empty($$ select 1 from public.public_saas where owner_id = 'd0000000-0000-4000-8000-000000000001' $$,
  'a suspended maker''s products are hidden');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select is_empty($$ select 1 from public.inbox where other_id = 'd0000000-0000-4000-8000-000000000001' $$,
  'conversations with a suspended maker leave the inbox');
select is(public.unread_message_count(), 0, 'their messages no longer count as unread');
select throws_ok(
  $$ select public.send_message('d0000000-0000-4000-8000-000000000001', 'Are you there?') $$,
  'P0001', 'This maker cannot receive messages', 'suspended makers receive no messages, and are not told apart from deleted ones');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select suspended_reason::text, suspended_note from public.profiles where id = 'd0000000-0000-4000-8000-000000000001' $$,
  $$ values ('spam'::text, 'Sent the same advertisement to many makers.'::text) $$,
  'the suspended maker sees the reason and explanation');
select is(
  (select count(*)::int from public.saas where owner_id = 'd0000000-0000-4000-8000-000000000001'),
  2, 'the suspended maker still sees their products');
select throws_ok(
  $$ select public.send_message('d0000000-0000-4000-8000-000000000002', 'One more offer') $$,
  'P0001', 'Your account is suspended, so you cannot send messages', 'suspended makers cannot send messages');
select throws_ok(
  $$ select public.submit_report('profile', 'd0000000-0000-4000-8000-000000000002', 'spam', '') $$,
  'P0001', 'Your account is suspended, so you cannot send reports', 'suspended makers cannot report');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$ select public.admin_suspend_account('d0000000-0000-4000-8000-000000000001', 'spam', 'Again.', null) $$,
  'P0001', 'This account is already suspended', 'an account cannot be suspended twice');
select lives_ok(
  $$ select public.admin_restore_account('d0000000-0000-4000-8000-000000000001', '') $$,
  'an admin restores the account');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select isnt_empty($$ select 1 from public.public_saas where owner_id = 'd0000000-0000-4000-8000-000000000001' $$,
  'a restored maker is listed again');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.send_message('d0000000-0000-4000-8000-000000000002', 'Sorry about that') $$,
  'a restored maker can send messages again');

-- Dismissing a report records the outcome for the reporter.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000005', true);
select lives_ok(
  $$ select public.admin_dismiss_report(
    (select id from public.reports where subject_id = 'd0000000-0000-4000-8000-000000000003' and status = 'open'),
    'Nothing against the terms.') $$,
  'an admin dismisses a report');
select throws_ok(
  $$ select public.admin_dismiss_report(
    (select id from public.reports where subject_id = 'd0000000-0000-4000-8000-000000000003' and target = 'profile' and reporter_id = 'd0000000-0000-4000-8000-000000000002'), '') $$,
  'P0001', 'This report is already closed', 'a closed report cannot be dismissed again');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select is(
  (select status from public.reports where subject_id = 'd0000000-0000-4000-8000-000000000003'),
  'dismissed', 'the reporter sees the outcome');

-- Deleting a reported product keeps the report and its copy for the admins.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
delete from public.saas where id = 'e0000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select results_eq(
  $$ select saas_id, content ->> 'name', status from public.reports
    where target = 'saas' and content ->> 'name' = 'Second Product'
      and reporter_id = 'd0000000-0000-4000-8000-000000000002' $$,
  $$ values (null::uuid, 'Second Product'::text, 'actioned'::text) $$,
  'a report outlives the deleted product');

-- Product limits: five new products a day and twenty in total, however they are written.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$ select public.save_saas(gen_random_uuid(), 'Limit ' || n, 'Limit fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
    false, false, false) from generate_series(1, 5) n $$,
  'a maker adds five products in a day');
select throws_ok(
  $$ select public.save_saas(gen_random_uuid(), 'Limit six', 'Limit fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
    false, false, false) $$,
  'P0001', 'You can add up to 5 products a day. Try again tomorrow', 'the sixth product in a day is refused');
select lives_ok(
  $$ delete from public.saas where id = (select id from public.saas
     where owner_id = 'd0000000-0000-4000-8000-000000000003' limit 1) $$,
  'the maker deletes one of the five');
select throws_ok(
  $$ select public.save_saas(gen_random_uuid(), 'Limit again', 'Limit fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
    false, false, false) $$,
  'P0001', 'You can add up to 5 products a day. Try again tomorrow',
  'deleting a product does not free a place for the day');
reset role;
-- Older products: added two days ago, so only the total limit applies to them.
update public.saas set created_at = now() - interval '2 days'
  where owner_id = 'd0000000-0000-4000-8000-000000000003';
update private.saas_additions set added_at = now() - interval '2 days'
  where owner_id = 'd0000000-0000-4000-8000-000000000003';
alter table public.saas disable trigger saas_limit;
insert into public.saas(owner_id, name, tagline, description, category, website, created_at)
select 'd0000000-0000-4000-8000-000000000003', 'Old ' || n, 'Older fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', now() - interval '2 days'
from generate_series(1, 16) n;
alter table public.saas enable trigger saas_limit;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.save_saas(gen_random_uuid(), 'Limit twenty-one', 'Limit fixture',
    'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null,
    false, false, false) $$,
  'P0001', 'An account can list up to 20 products', 'an account lists at most twenty products');

-- Account deletion removes reports and decisions about the person, and reports they made.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub', 'd0000000-0000-4000-8000-000000000002', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok('select public.delete_account()', 'the reporter deletes their account');
select set_config('request.jwt.claims', '', true);
reset role;
select is_empty($$ select 1 from public.reports where reporter_id = 'd0000000-0000-4000-8000-000000000002' $$,
  'reports a maker made are deleted with their account');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', json_build_object('sub', 'd0000000-0000-4000-8000-000000000005', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok('select public.delete_account()', 'an admin deletes their account');
select set_config('request.jwt.claims', '', true);
reset role;
select results_eq(
  $$ select admin_id, action from public.moderation_log where note = 'Nothing against the terms.' $$,
  $$ values (null::uuid, 'dismiss_report'::text) $$,
  'decisions by a deleted admin stay without their name');
select is_empty($$ select 1 from private.admins where user_id = 'd0000000-0000-4000-8000-000000000005' $$,
  'admin rights go with the account');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'd0000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok('select public.delete_account()', 'the reported maker deletes their account');
select set_config('request.jwt.claims', '', true);
reset role;
select is_empty(
  $$ select 1 from public.reports where subject_id = 'd0000000-0000-4000-8000-000000000001'
    union all select 1 from public.moderation_log where subject_id = 'd0000000-0000-4000-8000-000000000001' $$,
  'reports and decisions about a maker are deleted with their account');

select * from finish();
rollback;

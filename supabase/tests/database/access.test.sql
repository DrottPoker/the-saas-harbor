-- Grants, RLS, storage ownership, verified revenue and ranking. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(113);

insert into auth.users(id) values
  ('b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002');

-- Owner one: three products with different visibility choices.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000001', 'SQL Test Private',
    'Private fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, '2026-01-01', false, false, false) $$,
  'owner saves a SaaS that keeps revenue private'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000002', 'SQL Test Small',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, null, true, false, false) $$,
  'owner saves a SaaS that shares MRR'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000003', 'SQL Test Large',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, '2025-05-05', true, true, true) $$,
  'owner saves a SaaS that shares MRR, customers and launch date'
);

-- Makers can never write verified figures or read the stored key.
select throws_ok(
  $$ insert into public.revenue_snapshots(saas_id, owner_id, mrr_cents, customers, livemode)
    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 1, 1, true) $$,
  '42501', null, 'owner cannot insert a revenue snapshot'
);
select throws_ok(
  $$ update public.public_metrics set mrr_cents = 1 where saas_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'owner cannot write the public projection'
);
select throws_ok(
  $$ insert into public.stripe_connections(saas_id, owner_id, encrypted_key, key_hint, livemode)
    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'v1:x', 'x', true) $$,
  '42501', null, 'owner cannot create a Stripe connection directly'
);
select throws_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000002', null, null,
    true, 999999, 1, '{}', null, '{}', null, null, null) $$,
  '42501', null, 'owner cannot record a verification'
);
select throws_ok(
  $$ select private.refresh_public_metrics('c0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'owner cannot call the private refresh function'
);
select throws_ok(
  'select count(*) from private.stripe_subscription_claims',
  '42501', null, 'owner cannot read subscription claims'
);
select lives_ok(
  $$ insert into storage.objects(bucket_id, name)
    values ('profile-images', 'b0000000-0000-4000-8000-000000000001/own.png') $$,
  'owner uploads into own image folder'
);
select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
    values ('profile-images', 'b0000000-0000-4000-8000-000000000002/forged.png') $$,
  '42501', null, 'owner cannot upload into another user''s image folder'
);
select throws_ok(
  $$ update public.saas set owner_id = 'b0000000-0000-4000-8000-000000000002'
    where id = 'c0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'owner cannot transfer a SaaS to another user'
);

-- The trusted server records verified revenue.
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000001', 'v1:private',
    'rk_live_…0001', true, 99999900, 99, '{"usd": 99999900}', null,
    array[repeat('a', 64)], null, null, null) $$,
  'server verifies the private product'
);
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000002', 'v1:small',
    'rk_live_…0002', true, 1999, 1, '{"usd": 1999}', null, array[repeat('b', 64)], null, null, null) $$,
  'server verifies the small product'
);
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000003', 'v1:large',
    'rk_live_…0003', true, 100000, 2, '{"usd": 100000}', null, array[repeat('c', 64)], null, null, null) $$,
  'server verifies the large product'
);
select throws_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000003', null, null,
    true, 100000, 2, '{}', null, array[repeat('a', 64), repeat('c', 64)], null, null, null) $$,
  '23505', null, 'a subscription cannot verify two products'
);
select throws_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000009', null, null,
    true, 1, 1, '{}', null, '{}', null, null, null) $$,
  'P0002', null, 'verification requires an existing SaaS'
);

-- Owner one reads its own history and connection status, but never the key.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.revenue_snapshots), 3, 'owner reads own verified history');
select is(
  (select status from public.stripe_connections where saas_id = 'c0000000-0000-4000-8000-000000000002'),
  'ok', 'owner reads own connection status'
);
select throws_ok(
  'select encrypted_key from public.stripe_connections',
  '42501', null, 'owner cannot read the encrypted key'
);

-- Owner two sees and changes nothing of owner one's.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select is_empty('select * from public.revenue_snapshots', 'another owner cannot read verified history');
select is_empty('select saas_id from public.stripe_connections', 'another owner cannot see connections');
select is_empty('select * from public.saas_settings', 'another owner cannot read settings');
with changed as (
  update public.saas_settings set share_mrr = true
  where saas_id = 'c0000000-0000-4000-8000-000000000001' returning saas_id
)
select is(count(*)::int, 0, 'another owner cannot change visibility') from changed;
select throws_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000001', 'Hijacked',
    'Foreign edit attempt', 'A foreign owner should never change this product.', 'Other',
    'https://example.com', null, null, true, true, true) $$,
  '42501', null, 'another owner cannot save through the RPC'
);

-- Anonymous visitors.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*)::int from public.public_saas where id::text like 'c0000000-%'),
  3, 'every product is listed'
);
select results_eq(
  $$ select mrr_cents, customers, launched_on, revenue_status from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values (null::bigint, null::integer, null::date, 'private'::text) $$,
  'private verified figures and launch date stay hidden'
);
select results_eq(
  $$ select mrr_cents, customers, launched_on, revenue_status from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000003' $$,
  $$ values (100000::bigint, 2, '2025-05-05'::date, 'verified'::text) $$,
  'shared verified figures and launch date are public'
);
select is(
  (select array_agg(id order by rank) from public.leaderboard where id::text like 'c0000000-%'),
  array['c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002']::uuid[],
  'leaderboard ranks shared verified MRR numerically'
);
select throws_ok('select count(*) from public.revenue_snapshots', '42501', null,
  'anonymous visitors cannot read verified history');
select throws_ok('select count(*) from public.stripe_connections', '42501', null,
  'anonymous visitors cannot read connections');
select ok(
  not has_function_privilege('anon',
    'public.save_saas(uuid,text,text,text,text,text,text,date,boolean,boolean,boolean)', 'execute'),
  'anonymous visitors cannot execute save_saas'
);

-- Owner one hides MRR on one product; the server records zero MRR on another.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_mrr = false where saas_id = 'c0000000-0000-4000-8000-000000000003';
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000002', null, null,
    true, 0, 0, '{}', null, array[repeat('b', 64)], null, null, null) $$,
  'server records zero MRR'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is_empty(
  $$ select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'hidden MRR leaves the leaderboard'
);
select is(
  (select customers from public.public_saas where id = 'c0000000-0000-4000-8000-000000000003'),
  2, 'customer visibility is independent of MRR visibility'
);
select isnt_empty(
  $$ select 1 from public.leaderboard
    where id = 'c0000000-0000-4000-8000-000000000002' and mrr_cents = 0 $$,
  'zero verified MRR is ranked'
);

-- Stale verifications and disconnections. Ageing a snapshot needs the table owner.
reset role;
update public.revenue_snapshots set captured_at = now() - interval '8 days'
  where saas_id = 'c0000000-0000-4000-8000-000000000002';
select private.refresh_public_metrics('c0000000-0000-4000-8000-000000000002');
set local role service_role;
delete from public.stripe_connections where saas_id = 'c0000000-0000-4000-8000-000000000001';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select mrr_cents, revenue_status from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000002' $$,
  $$ values (null::bigint, 'stale'::text) $$,
  'a verification older than seven days is hidden and marked stale'
);
select is_empty(
  $$ select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000002' $$,
  'stale revenue is not ranked'
);
select is(
  (select revenue_status from public.public_saas where id = 'c0000000-0000-4000-8000-000000000001'),
  'unverified', 'disconnecting Stripe removes the verification'
);

set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000003', null, null,
    true, 100000, 2, '{}', null, array[repeat('a', 64), repeat('c', 64)], null, null, null) $$,
  'subscriptions released by a disconnect can verify another product'
);
select lives_ok(
  $$ delete from public.saas where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'deleting a connected SaaS cascades cleanly'
);

-- Revenue history follows the MRR sharing choice and staleness.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000004', 'SQL Test History',
    'History fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, null, true, false, false) $$,
  'owner saves a product that shares MRR'
);
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000004', 'v1:history',
    'rk_live_…0004', true, 100000, 5, '{}', null, array[repeat('d', 64)],
    '[{"month": "2026-07", "mrr_cents": 70000}, {"month": "2026-08", "mrr_cents": 90000}]',
    100000, 80000) $$,
  'server records history and the 30-day basis'
);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select jsonb_array_length(mrr_history), mrr_growth_pct from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000004' $$,
  $$ values (2, 25.0::numeric) $$,
  'shared MRR publishes its history and 30-day growth'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_mrr = false where saas_id = 'c0000000-0000-4000-8000-000000000004';
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select mrr_history, mrr_growth_pct from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000004' $$,
  $$ values (null::jsonb, null::numeric) $$,
  'hiding MRR also hides its history and growth'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_mrr = true where saas_id = 'c0000000-0000-4000-8000-000000000004';
reset role;
update public.revenue_snapshots set captured_at = now() - interval '8 days'
  where saas_id = 'c0000000-0000-4000-8000-000000000004';
select private.refresh_public_metrics('c0000000-0000-4000-8000-000000000004');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select mrr_history, mrr_growth_pct from public.public_saas
    where id = 'c0000000-0000-4000-8000-000000000004' $$,
  $$ values (null::jsonb, null::numeric) $$,
  'stale history and growth are hidden'
);


-- Personal profiles: the owner saves everything at once, everyone can read it, and the database
-- refuses what the form refuses.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."}]') $$,
  '42501', null, 'visitors cannot save a profile'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."},
      {"title": "Engineer", "organization": "Earlier Co", "starts_on": "2019-09-01",
      "ends_on": "2023-12-01", "description": ""}]') $$,
  'owner saves a personal profile with experience'
);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select headline, location, skills, linkedin_url from public.profiles
    where id = 'b0000000-0000-4000-8000-000000000001' $$,
  $$ values ('Solo founder'::text, 'Gothenburg'::text, array['Postgres', 'Next.js']::text[],
    'https://www.linkedin.com/in/sql-test'::text) $$,
  'everyone can read the personal profile'
);
select is(
  (select count(*)::int from public.profile_experience where profile_id = 'b0000000-0000-4000-8000-000000000001'),
  2, 'everyone can read the experience'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."}]') $$, 'saving again works');
select is(
  (select count(*)::int from public.profile_experience where profile_id = 'b0000000-0000-4000-8000-000000000001'),
  1, 'saving again replaces the experience'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'postgres'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."}]') $$,
  '23514', null, 'skills are unique, ignoring case'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', (select array_agg('Skill ' || n) from generate_series(1, 21) n), null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."}]') $$,
  '23514', null, 'a profile lists at most 20 skills'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://gitlab.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."}]') $$,
  '23514', null, 'the GitHub link must point to GitHub'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://evil.example/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": null, "description": "Building."}]') $$,
  '23514', null, 'the LinkedIn link must point to LinkedIn'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-01",
      "ends_on": "2023-01-01"}]') $$,
  '23514', null, 'a role cannot end before it starts'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, '[{"title": "Founder", "organization": "SQL Test", "starts_on": "2024-01-15"}]') $$,
  '23514', null, 'roles are stored by month'
);
select throws_ok(
  $$ select public.save_profile('SQL Test One', 'Solo founder', 'Gothenburg', 'A longer story.', 'https://example.com', 'https://www.linkedin.com/in/sql-test', 'https://github.com/sql-test', 'https://x.com/sqltest', '', array['Postgres', 'Next.js'], null, (select jsonb_agg(jsonb_build_object('title', 'Role ' || n,
      'organization', 'SQL Test', 'starts_on', '2020-01-01')) from generate_series(1, 41) n)) $$,
  '23514', 'A profile can list up to 40 roles', 'a profile lists at most 40 roles'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ insert into public.profile_experience(profile_id, title, organization, starts_on)
    values ('b0000000-0000-4000-8000-000000000001', 'Forged', 'Forged', '2020-01-01') $$,
  '42501', null, 'makers cannot add roles to another profile'
);
delete from public.profile_experience where profile_id = 'b0000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select count(*)::int from public.profile_experience where profile_id = 'b0000000-0000-4000-8000-000000000001'),
  1, 'makers cannot remove roles from another profile'
);

-- Messages: only the two makers in a conversation can read it, writes go through
-- send_message(), blocks work in both directions, and Realtime events carry ids only.
reset role;
insert into auth.users(id) values ('b0000000-0000-4000-8000-000000000003');
insert into public.profiles(id, name) values ('b0000000-0000-4000-8000-000000000002', 'SQL Test Two'), ('b0000000-0000-4000-8000-000000000003', 'SQL Test Three')
  on conflict (id) do nothing;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', 'Hello') $$,
  '42501', null, 'visitors cannot send messages'
);
select throws_ok(
  'select count(*) from public.messages',
  '42501', null, 'visitors cannot read messages'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000001', 'Hello me') $$,
  'P0001', 'Choose another maker to message', 'makers cannot message themselves'
);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', '   ') $$,
  'P0001', 'Write a message first', 'blank messages are refused'
);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', repeat('x', 4001)) $$,
  'P0001', 'Messages can be up to 4,000 characters', 'messages over 4,000 characters are refused'
);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000009', 'Hello') $$,
  'P0001', 'This maker no longer has an account', 'messages need an existing recipient'
);
select lives_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', '  Hello from one  ') $$,
  'a maker sends a message'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000001', 'Hello from two') $$,
  'the other maker replies'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', 'Hello from three') $$,
  'a third maker writes to maker two'
);

reset role;
select results_eq(
  $$ select c.user_a, c.user_b, c.started_by, m.body from public.conversations c
    join public.messages m on m.conversation_id = c.id
    where c.user_a = 'b0000000-0000-4000-8000-000000000001' and c.user_b = 'b0000000-0000-4000-8000-000000000002' order by m.created_at limit 1 $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'Hello from one') $$,
  'one conversation per pair, started by the first sender, with trimmed text'
);
create temp table pgtap_pair as select id from public.conversations
  where user_a = 'b0000000-0000-4000-8000-000000000001' and user_b = 'b0000000-0000-4000-8000-000000000002';
grant select on pgtap_pair to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select is(public.unread_message_count(), 1, 'the reply is unread for the first maker');
select results_eq(
  $$ select other_id, other_name, last_body, unread, blocked from public.inbox $$,
  $$ values ('b0000000-0000-4000-8000-000000000002'::uuid, 'SQL Test Two'::text, 'Hello from two'::text, 1, false) $$,
  'the inbox shows the other maker, the latest message and the unread count'
);
select lives_ok(
  $$ select public.mark_conversation_read((select id from public.conversations where user_a = 'b0000000-0000-4000-8000-000000000001' and user_b = 'b0000000-0000-4000-8000-000000000002'), now() + interval '1 minute') $$,
  'a maker marks the conversation read'
);
select is(public.unread_message_count(), 0, 'reading clears the unread count');
select throws_ok(
  $$ insert into public.messages(conversation_id, sender_id, body)
    values ((select id from public.conversations where user_a = 'b0000000-0000-4000-8000-000000000001' and user_b = 'b0000000-0000-4000-8000-000000000002'), 'b0000000-0000-4000-8000-000000000001', 'Forged') $$,
  '42501', null, 'makers cannot insert messages directly'
);
select throws_ok(
  $$ update public.messages set body = 'Changed' where sender_id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'makers cannot change messages'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select is_empty(
  'select 1 from public.messages where conversation_id = (select id from pgtap_pair)',
  'other makers cannot read the messages'
);
select is_empty(
  'select 1 from public.conversations where id = (select id from pgtap_pair)',
  'other makers cannot see the conversation'
);
select public.mark_conversation_read((select id from pgtap_pair), now());
reset role;
select is(
  (select count(*)::int from public.conversation_reads where user_id = 'b0000000-0000-4000-8000-000000000003'
    and conversation_id = (select id from pgtap_pair)),
  0, 'other makers cannot mark the conversation read'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ insert into public.blocks(blocker_id, blocked_id) values ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001') $$,
  'a maker blocks another'
);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000001', 'Still there?') $$,
  'P0001', 'Messages between you and this maker are blocked',
  'the maker who blocked cannot send either'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select is_empty('select 1 from public.blocks', 'a blocked maker cannot see the block');
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', 'Hello?') $$,
  'P0001', 'Messages between you and this maker are blocked', 'a blocked maker cannot send'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
delete from public.blocks where blocked_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', 'Thanks for unblocking') $$,
  'messages work again after unblocking'
);
select lives_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', 'Message ' || n) from generate_series(1, 18) n $$,
  'a maker sends twenty messages within a minute'
);
select throws_ok(
  $$ select public.send_message('b0000000-0000-4000-8000-000000000002', 'One too many') $$,
  'P0001', 'You are sending messages too quickly. Try again later',
  'the twenty-first message within a minute is refused'
);

reset role;
select is_empty(
  $$ select 1 from realtime.messages
    where topic in ('user:b0000000-0000-4000-8000-000000000001', 'user:b0000000-0000-4000-8000-000000000002') and (payload ? 'body' or event <> 'message') $$,
  'Realtime events carry ids only'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select set_config('realtime.topic', 'user:b0000000-0000-4000-8000-000000000002', true);
select isnt_empty(
  'select 1 from realtime.messages',
  'a maker can receive events on their own channel'
);
select set_config('realtime.topic', 'user:b0000000-0000-4000-8000-000000000001', true);
select is_empty(
  'select 1 from realtime.messages',
  'a maker cannot receive events on another maker''s channel'
);
select set_config('realtime.topic', '', true);

-- Product deletion: only the owner, and it removes everything that belongs to the product.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000006', 'SQL Test Delete',
    'Delete fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, null, true, false, false) $$,
  'owner saves a product to delete'
);
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000006', 'v1:delete',
    'rk_live_…0006', true, 5000, 3, '{"usd": 5000}', null, array[repeat('e', 64)],
    '[{"month": "2026-08", "mrr_cents": 4000}]', 5000, 4000) $$,
  'server verifies the product to delete'
);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ delete from public.saas where id = 'c0000000-0000-4000-8000-000000000006' $$,
  '42501', null, 'visitors cannot delete a product'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
delete from public.saas where id = 'c0000000-0000-4000-8000-000000000006';
select isnt_empty(
  $$ select 1 from public.saas where id = 'c0000000-0000-4000-8000-000000000006' $$,
  'another owner cannot delete the product'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ delete from public.saas where id = 'c0000000-0000-4000-8000-000000000006' $$,
  'the owner deletes the product'
);
reset role;
select is_empty(
  $$ select 1 from public.saas where id = 'c0000000-0000-4000-8000-000000000006' $$,
  'the product is gone'
);
select is_empty(
  $$ select saas_id from public.saas_settings where saas_id = 'c0000000-0000-4000-8000-000000000006'
  union all select saas_id from public.public_metrics where saas_id = 'c0000000-0000-4000-8000-000000000006'
  union all select saas_id from public.revenue_snapshots where saas_id = 'c0000000-0000-4000-8000-000000000006'
  union all select saas_id from public.stripe_connections where saas_id = 'c0000000-0000-4000-8000-000000000006'
  union all select saas_id from private.stripe_subscription_claims where saas_id = 'c0000000-0000-4000-8000-000000000006' $$,
  'settings, metrics, snapshots, the Stripe key and claims go with the product'
);
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000001', 'v1:again',
    'rk_live_…0001', true, 5000, 3, '{"usd": 5000}', null, array[repeat('e', 64)],
    null, null, null) $$,
  'the Stripe account of a deleted product can verify another product'
);

-- Account deletion: only the signed-in maker, only after a recent password sign-in, and it
-- removes everything they own while other makers keep theirs.
reset role;
insert into auth.audit_log_entries(id, payload) values
  (gen_random_uuid(), json_build_object('action', 'login', 'actor_id', 'b0000000-0000-4000-8000-000000000001')),
  (gen_random_uuid(), json_build_object('action', 'user_signedup',
    'actor_id', '00000000-0000-0000-0000-000000000000', 'traits', json_build_object('user_id', 'b0000000-0000-4000-8000-000000000001'))),
  (gen_random_uuid(), json_build_object('action', 'login', 'actor_id', 'b0000000-0000-4000-8000-000000000002'));
insert into auth.refresh_tokens(token, user_id) values ('pgtap-refresh-token', 'b0000000-0000-4000-8000-000000000001');
insert into auth.flow_state(id, user_id, provider_type, authentication_method)
  values (gen_random_uuid(), 'b0000000-0000-4000-8000-000000000001', 'email', 'email/signup');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  'select public.delete_account()',
  '42501', null, 'visitors cannot call account deletion'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000005', 'SQL Test Other Owner',
    'Other fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, null, true, false, false) $$,
  'another owner saves a product'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'b0000000-0000-4000-8000-000000000001')::text, true);
select throws_ok(
  'select public.delete_account()',
  '42501', 'Confirm your password to delete your account',
  'a session without a password sign-in cannot delete the account'
);
select set_config('request.jwt.claims', json_build_object('sub', 'b0000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 600)))::text, true);
select throws_ok(
  'select public.delete_account()',
  '42501', 'Confirm your password to delete your account',
  'a password sign-in older than five minutes is not enough'
);
select set_config('request.jwt.claims', json_build_object('sub', 'b0000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint - 0)))::text, true);
select throws_ok(
  'select public.delete_account()',
  '42501', 'Confirm your password to delete your account',
  'an email link sign-in is not enough'
);
select set_config('request.jwt.claims', json_build_object('sub', 'b0000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 5)))::text, true);
select lives_ok(
  'select public.delete_account()',
  'a maker deletes their own account right after confirming the password'
);
select set_config('request.jwt.claims', '', true);

reset role;
select is_empty(
  $$ select 1 from auth.users where id = 'b0000000-0000-4000-8000-000000000001' $$,
  'the auth user is deleted'
);
select is(
  (select count(*)::int from (
    select id from public.profiles where id = 'b0000000-0000-4000-8000-000000000001'
    union all select id from public.saas where owner_id = 'b0000000-0000-4000-8000-000000000001'
    union all select saas_id from public.saas_settings where owner_id = 'b0000000-0000-4000-8000-000000000001'
    union all select saas_id from public.public_metrics where owner_id = 'b0000000-0000-4000-8000-000000000001'
    union all select saas_id from public.revenue_snapshots where owner_id = 'b0000000-0000-4000-8000-000000000001'
    union all select saas_id from public.stripe_connections where owner_id = 'b0000000-0000-4000-8000-000000000001'
    union all select profile_id from public.profile_experience where profile_id = 'b0000000-0000-4000-8000-000000000001'
  ) owned),
  0, 'profile, experience, products, settings, metrics, snapshots and Stripe keys are deleted'
);
select is_empty(
  $$ select 1 from private.stripe_subscription_claims
    where saas_id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000004') $$,
  'subscription claims are deleted'
);
select is_empty(
  $$ select 1 from auth.audit_log_entries
    where payload ->> 'actor_id' = 'b0000000-0000-4000-8000-000000000001' or payload -> 'traits' ->> 'user_id' = 'b0000000-0000-4000-8000-000000000001'
  union all select 1 from auth.refresh_tokens where user_id = 'b0000000-0000-4000-8000-000000000001'
  union all select 1 from auth.flow_state where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  'audit log entries, refresh tokens and sign-in flows are deleted'
);
select is(
  (select count(*)::int from auth.audit_log_entries where payload ->> 'actor_id' = 'b0000000-0000-4000-8000-000000000002'),
  1, 'other users keep their audit log entries'
);
select results_eq(
  $$ select (select count(*)::int from auth.users where id = 'b0000000-0000-4000-8000-000000000002'),
    (select count(*)::int from public.saas where owner_id = 'b0000000-0000-4000-8000-000000000002') $$,
  $$ values (1, 1) $$,
  'other users keep their account and products'
);
set local role service_role;
select lives_ok(
  $$ select public.record_stripe_verification('c0000000-0000-4000-8000-000000000005', 'v1:other',
    'rk_live_…0005', true, 1000, 1, '{}', null, array[repeat('d', 64)], null, null, null) $$,
  'subscriptions of a deleted account can verify another product'
);

reset role;
select is_empty(
  $$ select 1 from public.conversations where 'b0000000-0000-4000-8000-000000000001' in (user_a, user_b) $$,
  'conversations with a deleted account are deleted for both makers'
);
select isnt_empty(
  $$ select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
    where c.user_a = 'b0000000-0000-4000-8000-000000000002' and c.user_b = 'b0000000-0000-4000-8000-000000000003' $$,
  'other conversations are kept'
);

reset role;
select * from finish();
rollback;

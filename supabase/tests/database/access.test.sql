-- Grants, RLS, storage ownership and ranking. Runs inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users(id) values
  ('b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002');

-- Owner one: a private SaaS, a small public SaaS and a large public SaaS.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000001', 'SQL Test Private',
    'Private fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, 99999900, 99, '2026-01-01', false, false, false) $$,
  'owner saves a SaaS with private metrics'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000002', 'SQL Test Small',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, 1999, 1, null, true, false, false) $$,
  'owner saves a SaaS with public MRR'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000003', 'SQL Test Large',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, 100000, 2, null, true, true, false) $$,
  'owner saves a SaaS with public MRR and customers'
);
select is((select count(*)::int from public.metric_reports), 3, 'owner reads own metric history');
select is(
  (select mrr_cents from public.public_saas where id = 'c0000000-0000-4000-8000-000000000001'),
  null,
  'private MRR is absent from the public view, even for its owner'
);
select throws_ok(
  $$ update public.saas set owner_id = 'b0000000-0000-4000-8000-000000000002'
    where id = 'c0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'owner cannot transfer a SaaS to another user'
);
select lives_ok(
  $$ insert into storage.objects(bucket_id, name)
    values ('profile-images', 'b0000000-0000-4000-8000-000000000001/own.png') $$,
  'owner uploads into own image folder'
);
select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
    values ('profile-images', 'b0000000-0000-4000-8000-000000000002/forged.png') $$,
  '42501',
  null,
  'owner cannot upload into another user''s image folder'
);

-- Owner two: no access to owner one's private or writable data.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);

select is_empty('select * from public.metric_reports', 'another owner cannot read metric history');
with changed as (
  update public.saas set name = 'Hijacked'
  where id = 'c0000000-0000-4000-8000-000000000001' returning id
)
select is(count(*)::int, 0, 'another owner cannot update a SaaS') from changed;
with changed as (
  update public.profiles set name = 'Hijacked'
  where id = 'b0000000-0000-4000-8000-000000000001' returning id
)
select is(count(*)::int, 0, 'another owner cannot update a profile') from changed;
with changed as (
  update public.public_metrics set mrr_cents = 5
  where saas_id = 'c0000000-0000-4000-8000-000000000002' returning saas_id
)
select is(count(*)::int, 0, 'another owner cannot update public metrics') from changed;
select throws_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000001', 'Hijacked',
    'Foreign edit attempt', 'A foreign owner should never change this product.', 'Other',
    'https://example.com', null, 1, null, null, true, false, false) $$,
  '42501',
  null,
  'another owner cannot save through the RPC'
);

-- Anonymous visitors.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::int from public.public_saas where id::text like 'c0000000-%'),
  3,
  'SaaS without public MRR stay discoverable'
);
select is_empty(
  $$ select 1 from public.public_saas where id = 'c0000000-0000-4000-8000-000000000001'
    and (mrr_cents is not null or customers is not null or launched_on is not null) $$,
  'private metrics are not exposed'
);
select is(
  (select array_agg(id order by rank) from public.leaderboard where id::text like 'c0000000-%'),
  array['c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002']::uuid[],
  'leaderboard ranks public MRR numerically'
);
select throws_ok(
  'select count(*) from public.metric_reports',
  '42501',
  null,
  'anonymous visitors cannot read metric history'
);
select ok(
  not has_function_privilege('anon',
    'public.save_saas(uuid,text,text,text,text,text,text,bigint,integer,date,boolean,boolean,boolean)',
    'execute'),
  'anonymous visitors cannot execute save_saas'
);

-- Owner one revokes public MRR on one SaaS and shares zero MRR on another.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000003', 'SQL Test Large',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, 100000, 2, null, false, true, false) $$,
  'owner revokes public MRR'
);
select lives_ok(
  $$ select public.save_saas('c0000000-0000-4000-8000-000000000002', 'SQL Test Small',
    'Public fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
    null, 0, 1, null, true, false, false) $$,
  'owner shares zero MRR'
);
select is(
  (select count(*)::int from public.metric_reports),
  5,
  'every save appends a private metric report'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is_empty(
  $$ select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'revoked MRR leaves the leaderboard'
);
select is(
  (select customers from public.public_saas where id = 'c0000000-0000-4000-8000-000000000003'),
  2,
  'customer visibility is independent of MRR visibility'
);
select isnt_empty(
  $$ select 1 from public.leaderboard
    where id = 'c0000000-0000-4000-8000-000000000002' and mrr_cents = 0 $$,
  'zero MRR is ranked'
);

reset role;
select * from finish();
rollback;

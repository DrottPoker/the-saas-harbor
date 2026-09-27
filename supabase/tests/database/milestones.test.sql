-- Milestones: MRR thresholds and leaderboard places are recorded once per product, only from
-- shared and verified MRR, with one email for what is reached at once; visitors see them only
-- while the MRR is shared. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id, email) values
  ('e7000000-0000-4000-8000-000000000001', 'founder@milestones.test'),
  ('e7000000-0000-4000-8000-000000000002', 'quiet@milestones.test');
insert into public.profiles(id, name) values
  ('e7000000-0000-4000-8000-000000000001', 'Milestone Founder'),
  ('e7000000-0000-4000-8000-000000000002', 'Quiet Founder');
create temp view pgtap_milestone_emails as
  select o.* from private.email_outbox o
  where o.user_id::text like 'e7000000-%' and o.kind = 'milestone';

-- Places count only on a leaderboard of 25 products; the fixtures below make sure it has them.
create temp table ranked_before on commit drop as
select count(*)::integer as ranked
from public.saas s
join public.profiles p on p.id = s.owner_id
join public.public_metrics m on m.saas_id = s.id
where s.hidden_at is null and p.suspended_at is null and m.mrr_cents is not null
  and m.verified_at > now() - interval '7 days';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
select public.save_saas('e7100000-0000-4000-8000-000000000001', 'Milestone Shared', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
select public.save_saas('e7100000-0000-4000-8000-000000000002', 'Milestone Private', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, false,
  false, false);

-- The first verification reaches every threshold up to its MRR, in one email.
set local role service_role;
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000001', 'stripe',
  'v1:one', 'rk_live_…one1', true, 300000, 12, '{"usd": 300000}', null, array[repeat('a', 64)],
  null, null, null, null);
set local role postgres;
select results_eq(
  $$ select milestone from public.saas_milestones
     where saas_id = 'e7100000-0000-4000-8000-000000000001' and milestone like 'mrr-%'
     order by reached_at, milestone $$,
  $$ values ('mrr-100'::text), ('mrr-1000'), ('mrr-2500'), ('mrr-500') $$,
  'a first verification of $3,000 reaches the four thresholds up to it');
select ok((select ranked from ranked_before) >= 24 or not exists (
    select 1 from public.saas_milestones
    where saas_id = 'e7100000-0000-4000-8000-000000000001' and milestone like 'top-%'),
  'a place does not count on a leaderboard of fewer than 25 products');
select results_eq(
  $$ select user_id, topic, (select array_agg(k order by k) from jsonb_array_elements_text(payload -> 'milestones') k)
     from pgtap_milestone_emails $$,
  $$ values ('e7000000-0000-4000-8000-000000000001'::uuid,
    'milestone:e7100000-0000-4000-8000-000000000001'::text,
    array['mrr-100', 'mrr-1000', 'mrr-2500', 'mrr-500']) $$,
  'everything reached at once goes into one email to the founder');

-- A re-verification with the same MRR, and a dip and recovery, reach nothing new.
set local role service_role;
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 300000, 12, '{"usd": 300000}', null, array[repeat('a', 64)], null, null,
  null, null);
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 50000, 12, '{"usd": 50000}', null, array[repeat('a', 64)], null, null,
  null, null);
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 300000, 12, '{"usd": 300000}', null, array[repeat('a', 64)], null, null,
  null, null);
set local role postgres;
select is((select count(*)::int from pgtap_milestone_emails), 1,
  'a milestone is reached once, even after MRR dips below it');

-- Passing the next threshold queues a new email with that one only.
set local role service_role;
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000001', 'stripe',
  null, null, true, 600000, 14, '{"usd": 600000}', null, array[repeat('a', 64)], null, null,
  null, null);
set local role postgres;
select results_eq(
  $$ select payload -> 'milestones' from pgtap_milestone_emails order by id desc limit 1 $$,
  $$ values ('["mrr-5000"]'::jsonb) $$,
  'passing $5,000 queues an email about $5,000 alone');

-- Private MRR reaches nothing.
set local role service_role;
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000002', 'stripe',
  'v1:two', 'rk_live_…two2', true, 900000, 30, '{"usd": 900000}', null, array[repeat('b', 64)],
  null, null, null, null);
set local role postgres;
select is_empty($$ select 1 from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000002' $$,
  'a product that keeps its MRR private reaches no milestone');

-- Sharing it later reaches what the shared MRR has passed.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_mrr = true
where saas_id = 'e7100000-0000-4000-8000-000000000002';
set local role postgres;
select is((select count(*)::int from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000002' and milestone like 'mrr-%'), 5,
  'sharing MRR reaches the thresholds it has passed');

-- Visitors see a product's milestones only while its MRR is verified and shared.
set local role anon;
select is((select count(*)::int from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000001'), 5,
  'visitors see the milestones of a product with shared MRR');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
update public.saas_settings set share_mrr = false
where saas_id = 'e7100000-0000-4000-8000-000000000001';
set local role anon;
select is_empty($$ select 1 from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000001' $$,
  'visitors do not see the milestones once the MRR is private');
set local role postgres;
update public.public_metrics set verified_at = now() - interval '8 days'
where saas_id = 'e7100000-0000-4000-8000-000000000002';
set local role anon;
select is_empty($$ select 1 from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000002' $$,
  'visitors do not see the milestones of a product whose verification is out of date');
select throws_ok($$ insert into public.saas_milestones(saas_id, milestone)
  values ('e7100000-0000-4000-8000-000000000002', 'mrr-1000000') $$, '42501', null,
  'visitors cannot record a milestone');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);
select throws_ok($$ insert into public.saas_milestones(saas_id, milestone)
  values ('e7100000-0000-4000-8000-000000000002', 'mrr-1000000') $$, '42501', null,
  'founders cannot record a milestone themselves');

-- The worker reads the product's current state: with MRR private, the email is not wanted.
set local role service_role;
select results_eq(
  $$ select c.email, c.context ->> 'name', c.context ->> 'slug', (c.context ->> 'wanted')::boolean,
      (c.context ->> 'shown')::boolean, c.context ->> 'provider'
    from public.claim_emails(100, 0) c
    where c.kind = 'milestone' and c.email = 'founder@milestones.test'
    order by c.id limit 1 $$,
  $$ values ('founder@milestones.test'::text, 'Milestone Shared'::text, 'milestone-shared'::text,
    true, false, 'stripe'::text) $$,
  'a milestone email knows the product, and that its MRR is no longer shown');

-- Turning milestone emails off records milestones without emails, and saving without the
-- setting keeps it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000002', true);
select public.save_notification_settings(true, true, false);
select public.save_notification_settings(true, true);
select results_eq($$ select milestones from public.notification_settings $$,
  $$ values (false) $$, 'saving without the milestone setting keeps it');
select public.save_saas('e7100000-0000-4000-8000-000000000003', 'Milestone Quiet', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
set local role service_role;
select public.record_revenue_verification('e7100000-0000-4000-8000-000000000003', 'stripe',
  'v1:three', 'rk_live_…thr3', true, 20000, 3, '{"usd": 20000}', null, array[repeat('c', 64)],
  null, null, null, null);
set local role postgres;
select is((select count(*)::int from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000003'), 1,
  'a founder without milestone emails still reaches milestones');
select is_empty($$ select 1 from pgtap_milestone_emails
  where user_id = 'e7000000-0000-4000-8000-000000000002' $$,
  'a founder without milestone emails gets none');

-- Places: 26 products far above any real one fill the top of the leaderboard.
insert into auth.users(id)
select ('e8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 26) g;
insert into public.profiles(id, name)
select ('e8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'Rank Founder ' || g
from generate_series(1, 26) g;
insert into public.saas(id, owner_id, name, tagline, description, category, website)
select ('e8100000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  ('e8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'Rank Fixture ' || g, 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com'
from generate_series(1, 26) g;
insert into public.public_metrics(saas_id, owner_id, mrr_cents, verified_at, provider)
select ('e8100000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  ('e8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  (1000 - g)::bigint * 100000000, now(), 'stripe'
from generate_series(1, 26) g;
select results_eq(
  $$ select milestone, count(*)::int from public.saas_milestones
     where saas_id::text like 'e8100000-%' and milestone like 'top-%'
     group by milestone order by milestone $$,
  $$ values ('top-1'::text, 1), ('top-10', 10), ('top-3', 3) $$,
  'the leaderboard''s first place, top 3 and top 10 are reached');
select results_eq(
  $$ select milestone from public.saas_milestones
     where saas_id = 'e8100000-0000-4000-8000-000000000001' and milestone like 'top-%'
     order by milestone $$,
  $$ values ('top-1'::text), ('top-10'), ('top-3') $$,
  'first place also reaches the top 3 and the top 10');

-- A hidden product reaches nothing, and deleting a product deletes its milestones.
update public.saas set hidden_at = now(), hidden_reason = 'spam'
where id = 'e8100000-0000-4000-8000-000000000026';
update public.public_metrics set mrr_cents = mrr_cents * 10
where saas_id = 'e8100000-0000-4000-8000-000000000026';
select is_empty($$ select 1 from public.saas_milestones
  where saas_id = 'e8100000-0000-4000-8000-000000000026' and milestone like 'top-%' $$,
  'a hidden product reaches no place');
delete from public.saas where id = 'e7100000-0000-4000-8000-000000000003';
select is_empty($$ select 1 from public.saas_milestones
  where saas_id = 'e7100000-0000-4000-8000-000000000003' $$,
  'deleting a product deletes its milestones');

select * from finish();
rollback;

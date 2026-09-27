-- The admin funnel: the accounts created in a period, each step counting only the accounts that
-- took every step before it, with the median time from sign-up; and the leaderboard as visitors
-- see it in the admin reports. Runs in a rolled-back transaction, on accounts dated in 2001 so
-- local data does not matter.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- 1 signed up only, 2 confirmed, 3 listed a product, 4 verified revenue, 5 is on the leaderboard,
-- 6's product is hidden, 7 has a product without a confirmed email, 8 signed up a day later.
insert into auth.users(id, email, created_at, email_confirmed_at)
select ('e9000000-0000-4000-8000-00000000000' || k)::uuid, 'f' || k || '@funnel.test',
  '2001-01-01 00:00+00'::timestamptz, c::timestamptz
from (values ('1', null), ('2', '2001-01-01 01:00+00'), ('3', '2001-01-01 02:00+00'),
  ('4', '2001-01-01 03:00+00'), ('5', '2001-01-01 04:00+00'), ('6', '2001-01-01 05:00+00'),
  ('7', null)) as t(k, c);
insert into auth.users(id, email, created_at, email_confirmed_at) values
  ('e9000000-0000-4000-8000-000000000008', 'f8@funnel.test', '2001-01-02 00:00+00',
    '2001-01-02 00:00+00'),
  ('e9000000-0000-4000-8000-000000000009', 'admin@funnel.test', now() - interval '1 minute',
    now() - interval '1 minute');
insert into public.profiles(id, name)
select u.id, 'Funnel ' || split_part(u.email, '@', 1) from auth.users u
where u.email like '%@funnel.test';
insert into private.admins(user_id) values ('e9000000-0000-4000-8000-000000000009');

-- Products, 10, 20, 30, 40 and 45 hours after sign-up.
insert into public.saas(id, owner_id, name, tagline, description, category, website, created_at)
select ('e9100000-0000-4000-8000-00000000000' || k)::uuid,
  ('e9000000-0000-4000-8000-00000000000' || k)::uuid, 'Funnel product ' || k, 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  '2001-01-01 00:00+00'::timestamptz + make_interval(hours => h)
from (values ('3', 10), ('4', 20), ('5', 30), ('6', 40), ('7', 45)) as t(k, h);

-- Verified revenue 50, 60 and 70 hours after sign-up; 5 and 6 share it, verified today.
insert into public.revenue_snapshots(saas_id, owner_id, provider, mrr_cents, customers, livemode,
  captured_at)
select ('e9100000-0000-4000-8000-00000000000' || k)::uuid,
  ('e9000000-0000-4000-8000-00000000000' || k)::uuid, 'stripe', 1000, 1, true,
  '2001-01-01 00:00+00'::timestamptz + make_interval(hours => h)
from (values ('4', 50), ('5', 60), ('6', 70)) as t(k, h);
update public.public_metrics set mrr_cents = 1000, verified_at = now()
where saas_id in ('e9100000-0000-4000-8000-000000000005', 'e9100000-0000-4000-8000-000000000006');
update public.saas set hidden_at = now(), hidden_reason = 'spam'
where id = 'e9100000-0000-4000-8000-000000000006';

select is(private.funnel_period('2001-01-01 00:00+00', '2001-01-02 00:00+00'),
  jsonb_build_object('visitors', 0, 'steps', jsonb_build_array(
    jsonb_build_object('key', 'signed_up', 'accounts', 7, 'median_seconds', null),
    jsonb_build_object('key', 'confirmed', 'accounts', 5, 'median_seconds', 3 * 3600),
    jsonb_build_object('key', 'product', 'accounts', 4, 'median_seconds', 25 * 3600),
    jsonb_build_object('key', 'verified', 'accounts', 3, 'median_seconds', 60 * 3600),
    jsonb_build_object('key', 'ranked', 'accounts', 1, 'median_seconds', null))),
  'each step counts the accounts that took the steps before it, with the median time');
select is(private.funnel_steps('2001-01-02 00:00+00', '2001-01-03 00:00+00') -> 0 -> 'accounts',
  '1'::jsonb, 'an account belongs to the period it signed up in');
select is(private.funnel_steps('2000-01-01 00:00+00', '2000-01-02 00:00+00'),
  jsonb_build_array(
    jsonb_build_object('key', 'signed_up', 'accounts', 0, 'median_seconds', null),
    jsonb_build_object('key', 'confirmed', 'accounts', 0, 'median_seconds', null),
    jsonb_build_object('key', 'product', 'accounts', 0, 'median_seconds', null),
    jsonb_build_object('key', 'verified', 'accounts', 0, 'median_seconds', null),
    jsonb_build_object('key', 'ranked', 'accounts', 0, 'median_seconds', null)),
  'a period without sign-ups has empty steps');

-- Only admins read it, for every period, with the period before where there is one.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.admin_analytics_funnel('30d', 'UTC') $$, '42501',
  'Only admins can do this', 'users cannot read the funnel');
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000009', true);
select ok((select jsonb_array_length(r -> 'current' -> 'steps') = 5
    and (r -> 'current' -> 'steps' -> 0 ->> 'accounts')::int >= 1
    and jsonb_typeof(r -> 'previous') = 'object'
  from (select public.admin_analytics_funnel('24h', 'Europe/Stockholm') as r) f),
  'the last 24 hours hold the admin''s new account, and the day before');
select is((select public.admin_analytics_funnel('all', 'UTC') -> 'previous'), 'null'::jsonb,
  'all time has no period before');
select throws_ok($$ select public.admin_analytics_funnel('5y', 'UTC') $$, 'P0001', null,
  'an unknown period is refused');

-- The admin reports count the leaderboard as visitors see it: without hidden products.
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
create temp table visible on commit drop as select count(*)::int as ranked from public.leaderboard;
reset role;
grant select on visible to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000009', true);
select is((select (public.admin_analytics_platform('30d', 'UTC') -> 'now' ->> 'ranked')::int),
  (select ranked from visible), 'the platform report ranks the products visitors see');
reset role;
select ok(exists (select 1 from private.ranked_saas()
    where saas_id = 'e9100000-0000-4000-8000-000000000005')
  and not exists (select 1 from private.ranked_saas()
    where saas_id = 'e9100000-0000-4000-8000-000000000006'),
  'a hidden product is not ranked');

select * from finish();
rollback;

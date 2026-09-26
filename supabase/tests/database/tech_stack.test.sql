-- A product's tech stack: its form is checked, the maker save keeps it unless it sends one, and
-- the technology counts follow the category counts' rules. Runs in a rolled-back transaction, and
-- compares against the counts before the fixtures, so local data does not matter.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temp table before_counts on commit drop as
select tech, products, ranked from public.tech_counts;
grant select on before_counts to anon;

create function pg_temp.added(p_tech text) returns table(products integer, ranked integer)
language sql as $$
  select coalesce(c.products, 0) - coalesce(b.products, 0),
    coalesce(c.ranked, 0) - coalesce(b.ranked, 0)
  from (select 1) one
  left join public.tech_counts c on c.tech = p_tech
  left join before_counts b on b.tech = p_tech
$$;

insert into auth.users(id) values
  ('a9000000-0000-4000-8000-000000000001'),
  ('a9000000-0000-4000-8000-000000000002');
insert into public.profiles(id, name) values
  ('a9000000-0000-4000-8000-000000000001', 'Stack Maker'),
  ('a9000000-0000-4000-8000-000000000002', 'Stack Admin');
insert into private.admins(user_id) values ('a9000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
select public.save_saas('a9100000-0000-4000-8000-000000000001', 'Stack Ranked', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, false, false, array['nextjs', 'zz-stack-test']);
select public.save_saas('a9100000-0000-4000-8000-000000000002', 'Stack Listed', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, false, false, array['zz-stack-test']);

select is((select tech_stack from public.saas where id = 'a9100000-0000-4000-8000-000000000001'),
  array['nextjs', 'zz-stack-test'], 'the save stores the stack');

-- A save without a stack, like the code that was live before it, keeps the saved one.
select public.save_saas('a9100000-0000-4000-8000-000000000001', 'Stack Ranked', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, false, false);
select is((select tech_stack from public.saas where id = 'a9100000-0000-4000-8000-000000000001'),
  array['nextjs', 'zz-stack-test'], 'a save without a stack keeps the saved one');

select throws_ok($$ select public.save_saas('a9100000-0000-4000-8000-000000000002', 'Stack Listed',
  'Fixture', 'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null,
  null, true, false, false, array['nextjs', 'nextjs']) $$, '23514', null,
  'a technology cannot be listed twice');
select throws_ok($$ update public.saas set tech_stack = array['Next.js']
  where id = 'a9100000-0000-4000-8000-000000000002' $$, '23514', null,
  'a direct write still needs slugs');
select throws_ok($$ update public.saas set tech_stack = array(
  select 'tech-' || n from generate_series(1, 21) n)
  where id = 'a9100000-0000-4000-8000-000000000002' $$, '23514', null,
  'a stack has at most 20 technologies');
select lives_ok($$ update public.saas set tech_stack = array['zz-stack-test', 'react']
  where id = 'a9100000-0000-4000-8000-000000000002' $$,
  'the maker may write the stack directly, as they may the other fields');

set local role service_role;
select public.record_revenue_verification('a9100000-0000-4000-8000-000000000001', 'stripe',
  'v1:stack', 'rk_live_…stk', true, 5000, 2, '{"usd": 5000}', null,
  array[md5('stack') || md5('stack')], null, null, null);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq($$ select * from pg_temp.added('zz-stack-test') $$, $$ values (2, 1) $$,
  'every listed product counts, and shared verified MRR ranks');
select results_eq($$ select tech_stack from public.leaderboard
  where id = 'a9100000-0000-4000-8000-000000000001' $$,
  $$ values (array['nextjs', 'zz-stack-test']) $$, 'the leaderboard carries the stack');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
select public.admin_hide_saas('a9100000-0000-4000-8000-000000000002', 'spam', 'Spam.', null);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq($$ select * from pg_temp.added('zz-stack-test') $$, $$ values (1, 1) $$,
  'a hidden product is not counted');

set local role postgres;
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class
    where oid = 'public.tech_counts'::regclass),
  'the counts are read with the caller''s rights');

select * from finish();
rollback;

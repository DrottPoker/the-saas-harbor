-- Public counts for the category pages: only listed products count, and only shared, fresh MRR
-- ranks. Runs in a rolled-back transaction, and compares against the counts before the fixtures,
-- so local data does not matter.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temp table before_counts on commit drop as
select category, products, ranked from public.category_counts;
grant select on before_counts to anon;

create function pg_temp.added(p_category text) returns table(products integer, ranked integer)
language sql as $$
  select coalesce(c.products, 0) - coalesce(b.products, 0),
    coalesce(c.ranked, 0) - coalesce(b.ranked, 0)
  from (select 1) one
  left join public.category_counts c on c.category = p_category
  left join before_counts b on b.category = p_category
$$;

insert into auth.users(id) values
  ('a7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000002'),
  ('a7000000-0000-4000-8000-000000000003');
insert into public.profiles(id, name) values
  ('a7000000-0000-4000-8000-000000000001', 'Counts Maker'),
  ('a7000000-0000-4000-8000-000000000002', 'Counts Other Maker'),
  ('a7000000-0000-4000-8000-000000000003', 'Counts Admin');
insert into private.admins(user_id) values ('a7000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
-- Shared and verified, verified but private, and never verified.
select public.save_saas('a7100000-0000-4000-8000-000000000001', 'Counts Shared', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, false, false);
select public.save_saas('a7100000-0000-4000-8000-000000000002', 'Counts Private', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  false, false, false);
select public.save_saas('a7100000-0000-4000-8000-000000000003', 'Counts Unverified', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, false, false);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select public.save_saas('a7100000-0000-4000-8000-000000000004', 'Counts Hidden', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://example.com', null, null,
  true, false, false);
select public.save_saas('a7100000-0000-4000-8000-000000000005', 'Counts Finance', 'Fixture',
  'A temporary fixture that is rolled back.', 'Finance', 'https://example.com', null, null,
  true, false, false);

set local role service_role;
select public.record_revenue_verification(id, 'stripe', 'v1:counts', 'rk_live_…cnt', true, 5000, 2,
  '{"usd": 5000}', null, array[md5(id::text) || md5(id::text)], null, null, null)
from (values ('a7100000-0000-4000-8000-000000000001'::uuid),
  ('a7100000-0000-4000-8000-000000000002'::uuid), ('a7100000-0000-4000-8000-000000000004'::uuid),
  ('a7100000-0000-4000-8000-000000000005'::uuid)) products(id);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq($$ select * from pg_temp.added('Analytics') $$, $$ values (4, 2) $$,
  'every listed product counts, and shared verified MRR ranks');

-- A hidden product and a suspended maker's products leave the counts.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
select public.admin_hide_saas('a7100000-0000-4000-8000-000000000004', 'spam', 'Spam.', null);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq($$ select * from pg_temp.added('Analytics') $$, $$ values (3, 1) $$,
  'a hidden product is not counted');
select results_eq($$ select * from pg_temp.added('Finance') $$, $$ values (1, 1) $$,
  'the maker''s other products still count');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
select public.admin_suspend_account('a7000000-0000-4000-8000-000000000002', 'spam', 'Spam.', null);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq($$ select * from pg_temp.added('Finance') $$, $$ values (0, 0) $$,
  'a suspended maker''s products are not counted');

-- Stale figures are listed but no longer ranked.
set local role postgres;
update public.public_metrics set verified_at = now() - interval '8 days'
where saas_id = 'a7100000-0000-4000-8000-000000000001';
set local role anon;
select results_eq($$ select * from pg_temp.added('Analytics') $$, $$ values (3, 0) $$,
  'a stale verification is not ranked');

set local role postgres;
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class
    where oid = 'public.category_counts'::regclass),
  'the counts are read with the caller''s rights');

select * from finish();
rollback;

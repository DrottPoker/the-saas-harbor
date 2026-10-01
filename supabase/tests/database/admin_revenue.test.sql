-- Admins read the latest verified figures of any product, private and hidden ones included, while
-- it is connected. Nobody else can. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id, email) values
  ('e9000000-0000-4000-8000-000000000001', 'maker@admin-revenue.test'),
  ('e9000000-0000-4000-8000-000000000002', 'admin@admin-revenue.test');
insert into public.profiles(id, name) values
  ('e9000000-0000-4000-8000-000000000001', 'Admin Revenue Maker'),
  ('e9000000-0000-4000-8000-000000000002', 'Admin Revenue Admin');
insert into private.admins(user_id) values ('e9000000-0000-4000-8000-000000000002');

-- Private keeps every figure to the founder, Shared shares them all, Unconnected never connects
-- and Disconnected removes its connection.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
select public.save_saas('e9100000-0000-4000-8000-000000000001', 'Private', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, false,
  false, false);
select public.save_saas('e9100000-0000-4000-8000-000000000002', 'Shared', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
select public.save_saas('e9100000-0000-4000-8000-000000000003', 'Unconnected', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);
select public.save_saas('e9100000-0000-4000-8000-000000000004', 'Disconnected', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);

set local role service_role;
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000001', 'stripe',
  'v1:private', 'rk_live_…priv', true, 5000, 2, '{"usd": 5000}', null, '{}', null, null, null,
  null, 6000, 50000, 90000, now());
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000002', 'paddle',
  'v1:shared', 'pdl_live_…shar', true, 700, 1, '{"usd": 700}', null, '{}', null, null, null,
  null, 800, 8000, 9000, now());
select public.record_revenue_verification('e9100000-0000-4000-8000-000000000004', 'polar',
  'v1:disconnected', 'polar_oat_…disc', true, 100, 1, '{"usd": 100}', null, '{}', null, null,
  null);

set local role postgres;
-- An older snapshot of Private, which the latest one replaces.
insert into public.revenue_snapshots(saas_id, owner_id, provider, mrr_cents, customers, livemode,
  captured_at)
values ('e9100000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'stripe',
  1, 1, true, now() - interval '3 days');
-- Shared was last verified more than a week ago, so the site no longer shows its figures.
update public.revenue_snapshots set captured_at = now() - interval '8 days'
where saas_id = 'e9100000-0000-4000-8000-000000000002';
delete from public.revenue_connections where saas_id = 'e9100000-0000-4000-8000-000000000004';

-- Nobody but admins.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select * from public.admin_revenue(array['e9100000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', null, 'visitors cannot read figures through the admin function');
set local role service_role;
select throws_ok(
  $$ select * from public.admin_revenue(array['e9100000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', null, 'the service role does not use the admin function');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select * from public.admin_revenue(array['e9100000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', 'Only admins can do this', 'founders cannot use it, even for their own products');

-- Admins read every figure, whether the founder shares it or not.
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000002', true);
select public.admin_hide_saas('e9100000-0000-4000-8000-000000000001', 'spam', 'A fixture.', null);
select results_eq(
  $$ select provider, status, stale, mrr_cents, revenue_30d_cents, revenue_12m_cents,
       revenue_total_cents, share_revenue
     from public.admin_revenue(array['e9100000-0000-4000-8000-000000000001'::uuid]) $$,
  $$ values ('stripe'::text, 'ok'::text, false, 5000::bigint, 6000::bigint, 50000::bigint,
       90000::bigint, false) $$,
  'admins read the latest private figures of a hidden product');
select ok(
  (select verified_at > now() - interval '1 minute'
   from public.admin_revenue(array['e9100000-0000-4000-8000-000000000001'::uuid])),
  'with the time of the latest verification');
select results_eq(
  $$ select provider, stale, mrr_cents, revenue_30d_cents, share_revenue
     from public.admin_revenue(array['e9100000-0000-4000-8000-000000000002'::uuid]) $$,
  $$ values ('paddle'::text, true, 700::bigint, 800::bigint, true) $$,
  'figures the site no longer shows are marked out of date');
select is_empty(
  $$ select * from public.admin_revenue(array['e9100000-0000-4000-8000-000000000003',
       'e9100000-0000-4000-8000-000000000004']::uuid[]) $$,
  'products without a connection have no figures, as in the founder''s dashboard');
select results_eq(
  $$ select saas_id from public.admin_revenue(array['e9100000-0000-4000-8000-000000000001',
       'e9100000-0000-4000-8000-000000000002', 'e9100000-0000-4000-8000-000000000003']::uuid[])
     order by saas_id $$,
  $$ values ('e9100000-0000-4000-8000-000000000001'::uuid),
       ('e9100000-0000-4000-8000-000000000002'::uuid) $$,
  'one row per connected product asked for');
select is_empty(
  $$ select * from public.admin_revenue('{}') $$,
  'no products, no figures');

select * from finish();
rollback;

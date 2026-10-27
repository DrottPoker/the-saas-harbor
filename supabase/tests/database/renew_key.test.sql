-- A key the provider rotated during a read replaces the stored one only for the connection that was
-- read, and only the server may store it. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(id) values ('c8000000-0000-4000-8000-000000000001');
insert into public.profiles(id, name) values ('c8000000-0000-4000-8000-000000000001', 'Renew Maker');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000001', true);
select public.save_saas('c8100000-0000-4000-8000-000000000001', 'Renew Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, true,
  false, false);

set local role service_role;
select public.record_revenue_verification('c8100000-0000-4000-8000-000000000001', 'paypal',
  'v1:first', 'harbor… · …0001', true, 4200, 3, '{"usd": 4200}', null,
  array[repeat('f', 64)], null, null, null);

select is(
  public.renew_revenue_key('c8100000-0000-4000-8000-000000000001',
    (select connected_at from public.revenue_connections
      where saas_id = 'c8100000-0000-4000-8000-000000000001'), 'v1:renewed'),
  true, 'the server renews the key of the connection it read');
select is(
  (select encrypted_key from public.revenue_connections
    where saas_id = 'c8100000-0000-4000-8000-000000000001'),
  'v1:renewed', 'the renewed key is stored');
select is(
  public.renew_revenue_key('c8100000-0000-4000-8000-000000000001',
    '2000-01-01T00:00:00Z', 'v1:stale'),
  false, 'a run that read an older connection renews nothing');
select is(
  (select encrypted_key from public.revenue_connections
    where saas_id = 'c8100000-0000-4000-8000-000000000001'),
  'v1:renewed', 'the newer key is kept');

set local role authenticated;
select throws_ok(
  $$ select public.renew_revenue_key('c8100000-0000-4000-8000-000000000001', now(), 'v1:mine') $$,
  '42501', null, 'founders cannot replace a stored key this way');

select * from finish();
rollback;

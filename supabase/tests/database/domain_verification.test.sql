-- Domain verification: every product has a token that only its founder reads, the founder's
-- checks are their own and limited, only the server records a result, a missing record removes
-- the mark after three days, a new website removes it at once, and the daily check claims only
-- verified domains that are due. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users(id) values
  ('ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000002');
insert into public.profiles(id, name) values
  ('ad000000-0000-4000-8000-000000000001', 'Domain Maker'),
  ('ad000000-0000-4000-8000-000000000002', 'Domain Other');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
select public.save_saas('ad100000-0000-4000-8000-000000000001', 'Domain Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://www.domain-test.example/',
  null, null, false, false, false);

-- 1. The token.
select matches((select token from public.saas_domain_verification(
  'ad100000-0000-4000-8000-000000000001')), '^[0-9a-f]{32}$', 'a new product has a token');
select throws_ok($$ select * from private.saas_domains $$, '42501', null,
  'makers cannot read the tokens table');

select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000002', true);
select is_empty($$ select * from public.saas_domain_verification(
  'ad100000-0000-4000-8000-000000000001') $$, 'another user does not get the token');
select throws_ok($$ select public.begin_domain_check('ad100000-0000-4000-8000-000000000001') $$,
  'P0001', 'You can only verify the domain of your own SaaS', 'nor check the domain');

set local role anon;
select throws_ok($$ select public.begin_domain_check('ad100000-0000-4000-8000-000000000001') $$,
  '42501', null, 'visitors cannot check a domain');

-- 2. The founder's check, once every ten seconds.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
select is(public.begin_domain_check('ad100000-0000-4000-8000-000000000001'),
  (select token from public.saas_domain_verification('ad100000-0000-4000-8000-000000000001')),
  'a check returns the token to look for');
select throws_ok($$ select public.begin_domain_check('ad100000-0000-4000-8000-000000000001') $$,
  'P0001', 'The domain was checked a moment ago. Try again in a few seconds',
  'a second check right away is refused');

-- 3. Only the server records a result, and a maker cannot write the mark.
select throws_ok($$ select public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'found') $$, '42501', null,
  'makers cannot record a result');
select throws_ok($$ update public.saas set verified_domain = 'domain-test.example',
  domain_verified_at = now() where id = 'ad100000-0000-4000-8000-000000000001' $$, '42501', null,
  'makers cannot mark their own domain verified');

set local role service_role;
select is(public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'missing'), 'missing',
  'a missing record leaves an unverified domain unverified');
select is(public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://other.example/', 'other.example', 'found'), 'changed',
  'a result for another website is dropped');
select is(public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'found'), 'verified',
  'a found record verifies the domain');

set local role anon;
select results_eq($$ select verified_domain, domain_verified_at is not null from public.public_saas
  where id = 'ad100000-0000-4000-8000-000000000001' $$,
  $$ values ('domain-test.example'::text, true) $$, 'visitors see the verified domain');

-- 4. A record that goes missing keeps the mark for three days.
set local role service_role;
select is(public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'error'), 'error',
  'a DNS failure changes nothing');
select is(public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'missing'), 'grace',
  'a missing record starts three days of grace');
select isnt((select verified_domain from public.saas
  where id = 'ad100000-0000-4000-8000-000000000001'), null, 'the domain is still verified');

set local role postgres;
update private.saas_domains set missing_since = now() - interval '3 days 1 minute'
where saas_id = 'ad100000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'missing'), 'removed',
  'after three days the mark goes');
select results_eq($$ select verified_domain, domain_verified_at from public.saas
  where id = 'ad100000-0000-4000-8000-000000000001' $$,
  $$ values (null::text, null::timestamptz) $$, 'and the product is no longer verified');

-- 5. A new website on another host removes the mark; www. does not count as another host.
select public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://www.domain-test.example/', 'domain-test.example', 'found');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
select public.save_saas('ad100000-0000-4000-8000-000000000001', 'Domain Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://domain-test.example/pricing',
  null, null, false, false, false);
select is((select verified_domain from public.saas
  where id = 'ad100000-0000-4000-8000-000000000001'), 'domain-test.example',
  'the same host without www. keeps the mark');
update public.saas set website = 'https://elsewhere.example/'
where id = 'ad100000-0000-4000-8000-000000000001';
select results_eq($$ select verified_domain, domain_verified_at from public.saas
  where id = 'ad100000-0000-4000-8000-000000000001' $$,
  $$ values (null::text, null::timestamptz) $$, 'another host removes it at once');

-- 6. The daily check claims verified domains not looked up for 23 hours, once.
set local role service_role;
select public.record_domain_check('ad100000-0000-4000-8000-000000000001',
  'https://elsewhere.example/', 'elsewhere.example', 'found');
select is_empty($$ select * from public.claim_due_domain_checks(1000)
  where saas_id = 'ad100000-0000-4000-8000-000000000001' $$, 'a domain checked just now is not due');
set local role postgres;
update private.saas_domains set checked_at = now() - interval '1 day'
where saas_id = 'ad100000-0000-4000-8000-000000000001';
set local role service_role;
select results_eq($$ select website from public.claim_due_domain_checks(1000)
  where saas_id = 'ad100000-0000-4000-8000-000000000001' $$,
  $$ values ('https://elsewhere.example/'::text) $$, 'a day later it is due');
select is_empty($$ select * from public.claim_due_domain_checks(1000)
  where saas_id = 'ad100000-0000-4000-8000-000000000001' $$, 'and claimed only once');

set local role authenticated;
select throws_ok($$ select * from public.claim_due_domain_checks(10) $$, '42501', null,
  'makers cannot claim checks');

-- 7. The token goes with the product.
set local role postgres;
delete from public.saas where id = 'ad100000-0000-4000-8000-000000000001';
select is_empty($$ select * from private.saas_domains
  where saas_id = 'ad100000-0000-4000-8000-000000000001' $$, 'deleting the product removes its token');

select * from finish();
rollback;

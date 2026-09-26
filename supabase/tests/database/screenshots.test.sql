-- Screenshots: a new product is due at once, only the server claims and records them, a failure
-- waits longer each time, the founder's choice and a new website take the screenshot off, the
-- founder asks for a new one at most every ten minutes, and replaced files are handed over for
-- deletion once. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users(id) values
  ('ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000002');
insert into public.profiles(id, name) values
  ('ae000000-0000-4000-8000-000000000001', 'Shot Maker'),
  ('ae000000-0000-4000-8000-000000000002', 'Shot Other');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae000000-0000-4000-8000-000000000001', true);
select public.save_saas('ae100000-0000-4000-8000-000000000001', 'Shot Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://shot.example/', null, null,
  false, false, false);

-- 1. The founder's view, and what makers cannot do.
select results_eq($$ select requested_at is not null, attempted_at, last_error
  from public.saas_screenshot_status('ae100000-0000-4000-8000-000000000001') $$,
  $$ values (true, null::timestamptz, null::text) $$, 'a new product asks for a screenshot');
select throws_ok($$ select * from public.claim_due_screenshots(10) $$, '42501', null,
  'makers cannot claim screenshots');
select throws_ok($$ select public.record_screenshot('ae100000-0000-4000-8000-000000000001',
  'https://shot.example/', 'ae000000-0000-4000-8000-000000000001/screenshot-x.jpg', null) $$,
  '42501', null, 'makers cannot record one');
select throws_ok($$ update public.saas
  set screenshot_path = 'ae000000-0000-4000-8000-000000000001/screenshot-x.jpg',
    screenshot_taken_at = now()
  where id = 'ae100000-0000-4000-8000-000000000001' $$, '42501', null,
  'nor set one on their product');
select throws_ok($$ select * from public.take_stale_screenshots(10) $$, '42501', null,
  'nor take the files to delete');
select throws_ok($$ select public.request_screenshot('ae100000-0000-4000-8000-000000000001') $$,
  'P0001', 'A screenshot was taken or asked for in the last ten minutes. Try again later',
  'a new product has just asked for one');

select set_config('request.jwt.claim.sub', 'ae000000-0000-4000-8000-000000000002', true);
select is_empty($$ select * from public.saas_screenshot_status(
  'ae100000-0000-4000-8000-000000000001') $$, 'another user does not see the status');
select throws_ok($$ select public.request_screenshot('ae100000-0000-4000-8000-000000000001') $$,
  'P0001', 'You can only take a screenshot of your own SaaS', 'nor asks for a screenshot');

-- 2. The server claims it, once, and a failure waits.
set local role service_role;
select results_eq($$ select owner_id, website from public.claim_due_screenshots(1000,
  'ae100000-0000-4000-8000-000000000001') $$,
  $$ values ('ae000000-0000-4000-8000-000000000001'::uuid, 'https://shot.example/'::text) $$,
  'the new product is due');
select is_empty($$ select * from public.claim_due_screenshots(1000,
  'ae100000-0000-4000-8000-000000000001') $$, 'and claimed once');
select is(public.record_screenshot('ae100000-0000-4000-8000-000000000001',
  'https://shot.example/', null, 'The site answered with HTTP 503.'), '{}'::text[],
  'a failure is recorded');
set local role postgres;
update private.saas_screenshots set attempted_at = now() - interval '4 minutes'
where saas_id = 'ae100000-0000-4000-8000-000000000001';
set local role service_role;
select is_empty($$ select * from public.claim_due_screenshots(1000,
  'ae100000-0000-4000-8000-000000000001') $$, 'the first retry waits five minutes');
set local role postgres;
update private.saas_screenshots set attempted_at = now() - interval '6 minutes'
where saas_id = 'ae100000-0000-4000-8000-000000000001';
set local role service_role;
select isnt_empty($$ select * from public.claim_due_screenshots(1000,
  'ae100000-0000-4000-8000-000000000001') $$, 'and then it is due again');

-- 3. A screenshot is recorded and shown; the next one replaces it.
select is(public.record_screenshot('ae100000-0000-4000-8000-000000000001',
  'https://shot.example/', 'ae000000-0000-4000-8000-000000000001/screenshot-one.jpg', null),
  '{}'::text[], 'the first screenshot replaces nothing');
set local role anon;
select results_eq($$ select screenshot_path, screenshot_taken_at is not null from public.public_saas
  where id = 'ae100000-0000-4000-8000-000000000001' $$,
  $$ values ('ae000000-0000-4000-8000-000000000001/screenshot-one.jpg'::text, true) $$,
  'visitors see it');
set local role service_role;
select is_empty($$ select * from public.claim_due_screenshots(1000,
  'ae100000-0000-4000-8000-000000000001') $$, 'a fresh screenshot is not due');
select is(public.record_screenshot('ae100000-0000-4000-8000-000000000001',
  'https://shot.example/', 'ae000000-0000-4000-8000-000000000001/screenshot-two.jpg', null),
  array['ae000000-0000-4000-8000-000000000001/screenshot-one.jpg'],
  'a new screenshot hands back the file it replaces');
select is(public.record_screenshot('ae100000-0000-4000-8000-000000000001',
  'https://elsewhere.example/', 'ae000000-0000-4000-8000-000000000001/screenshot-three.jpg', null),
  array['ae000000-0000-4000-8000-000000000001/screenshot-three.jpg'],
  'a screenshot of another website is not used');

-- 4. Thirty days later it is due again.
set local role postgres;
update public.saas set screenshot_taken_at = now() - interval '31 days'
where id = 'ae100000-0000-4000-8000-000000000001';
set local role service_role;
select isnt_empty($$ select * from public.claim_due_screenshots(1000,
  'ae100000-0000-4000-8000-000000000001') $$, 'a screenshot older than 30 days is due');

-- 5. Turning it off takes it off the page; turning it on asks for a new one.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae000000-0000-4000-8000-000000000001', true);
select public.save_saas('ae100000-0000-4000-8000-000000000001', 'Shot Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://shot.example/', null, null,
  false, false, false, null, false);
select results_eq($$ select screenshot_path from public.saas
  where id = 'ae100000-0000-4000-8000-000000000001' $$, $$ values (null::text) $$,
  'turning the screenshot off takes it off the page');
select throws_ok($$ select public.request_screenshot('ae100000-0000-4000-8000-000000000001') $$,
  'P0001', 'Turn on the screenshot in the product''s settings first',
  'nothing is asked for while it is off');
select public.save_saas('ae100000-0000-4000-8000-000000000001', 'Shot Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://shot.example/', null, null,
  false, false, false);
select is((select show_screenshot from public.saas_settings
  where saas_id = 'ae100000-0000-4000-8000-000000000001'), false,
  'a save without the choice keeps it');

set local role service_role;
select is(array(select public.take_stale_screenshots(100)),
  array['ae000000-0000-4000-8000-000000000001/screenshot-two.jpg'],
  'the file is handed over for deletion');
select is(array(select public.take_stale_screenshots(100)), '{}'::text[], 'only once');

-- 6. A new website takes the screenshot off and asks for a new one.
set local role authenticated;
select public.save_saas('ae100000-0000-4000-8000-000000000001', 'Shot Product', 'Fixture',
  'A temporary fixture that is rolled back.', 'Analytics', 'https://shot.example/', null, null,
  false, false, false, null, true);
set local role service_role;
select public.record_screenshot('ae100000-0000-4000-8000-000000000001', 'https://shot.example/',
  'ae000000-0000-4000-8000-000000000001/screenshot-four.jpg', null);
set local role authenticated;
update public.saas set website = 'https://shot.example/new'
where id = 'ae100000-0000-4000-8000-000000000001';
select results_eq($$ select screenshot_path, requested_at is not null
  from public.saas s join public.saas_screenshot_status(s.id) on true
  where s.id = 'ae100000-0000-4000-8000-000000000001' $$,
  $$ values (null::text, true) $$, 'a new website takes it off and asks for a new one');
set local role service_role;
select is(array(select public.take_stale_screenshots(100)),
  array['ae000000-0000-4000-8000-000000000001/screenshot-four.jpg'],
  'and hands the old file over for deletion');

select * from finish();
rollback;

-- Limits on Stripe checks, image paths, and what account deletion removes from other makers'
-- data. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'owner@harden.test'),
  ('e1000000-0000-4000-8000-000000000002', 'other@harden.test');
insert into public.profiles(id, name) values
  ('e1000000-0000-4000-8000-000000000001', 'Harden Owner'),
  ('e1000000-0000-4000-8000-000000000002', 'Harden Other');
insert into public.saas(id, owner_id, name, tagline, description, category, website) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Harden One',
   'Hardening fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com');
insert into public.stripe_connections(saas_id, owner_id, encrypted_key, key_hint, livemode,
  last_synced_at)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'v1:x',
  'rk_test_…abcd', false, now() - interval '1 hour');

-- Stripe checks: only for one's own product, a refresh at most every five minutes, and 20 an hour.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.begin_stripe_check('e2000000-0000-4000-8000-000000000001', false) $$,
  'P0001', 'You can only manage Stripe for your own SaaS',
  'makers cannot check Stripe for another maker''s product');
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.begin_stripe_check('e2000000-0000-4000-8000-000000000001', true) $$,
  'a refresh an hour after the last one starts');
select throws_ok(
  $$ select public.begin_stripe_check('e2000000-0000-4000-8000-000000000001', true) $$,
  'P0001', 'Revenue was checked in the last few minutes. Try again later',
  'a second refresh within five minutes is refused, even though the first did not finish');
select lives_ok($$ select public.begin_stripe_check('e2000000-0000-4000-8000-000000000001', false) $$,
  'connecting a new key is not held back by a recent refresh');
select lives_ok(
  $$ select public.begin_stripe_check('e2000000-0000-4000-8000-000000000001', false)
     from generate_series(1, 18) $$,
  'a maker checks Stripe up to 20 times an hour');
select throws_ok(
  $$ select public.begin_stripe_check('e2000000-0000-4000-8000-000000000001', false) $$,
  'P0001', 'Stripe was checked many times in the last hour. Try again later',
  'the 21st check in an hour is refused');
select throws_ok('select count(*) from private.stripe_checks', '42501', null,
  'makers cannot read or reset the checks');

-- Image paths name a file directly in the owner's folder.
select throws_ok(
  $$ update public.profiles set avatar_path = 'e1000000-0000-4000-8000-000000000001/../e1000000-0000-4000-8000-000000000002/photo.png'
     where id = 'e1000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a photo path cannot climb into another maker''s folder');
select throws_ok(
  $$ update public.saas set logo_path = 'e1000000-0000-4000-8000-000000000001/nested/logo.png'
     where id = 'e2000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a logo path cannot point into a subfolder');
select lives_ok(
  $$ update public.saas set logo_path = 'e1000000-0000-4000-8000-000000000001/0b9f2e6c-logo.webp'
     where id = 'e2000000-0000-4000-8000-000000000001' $$,
  'a logo in the owner''s folder is accepted');

-- Deleting an account also removes the maker's id from others' queued emails and live events.
select public.send_message('e1000000-0000-4000-8000-000000000002', 'A message before leaving');
reset role;
select ok(
  exists (select 1 from realtime.messages m
    where m.topic = 'user:e1000000-0000-4000-8000-000000000002'
      and m.payload ->> 'sender_id' = 'e1000000-0000-4000-8000-000000000001')
  and exists (select 1 from private.email_outbox o
    where o.payload ->> 'sender_id' = 'e1000000-0000-4000-8000-000000000001'),
  'a message leaves a live event and a queued email that name the sender');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-8000-000000000001', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok('select public.delete_account()', 'the sender deletes their account');
select set_config('request.jwt.claims', '', true);
reset role;
select is_empty(
  $$ select 1 from realtime.messages m
     where m.topic = 'user:e1000000-0000-4000-8000-000000000001'
        or m.payload ->> 'sender_id' = 'e1000000-0000-4000-8000-000000000001'
     union all select 1 from private.email_outbox o
     where o.payload ->> 'sender_id' = 'e1000000-0000-4000-8000-000000000001'
     union all select 1 from private.stripe_checks k
     where k.owner_id = 'e1000000-0000-4000-8000-000000000001'
     union all select 1 from private.saas_additions a
     where a.owner_id = 'e1000000-0000-4000-8000-000000000001' $$,
  'no event, email, Stripe check or product addition names the deleted maker');

select * from finish();
rollback;

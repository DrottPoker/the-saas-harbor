-- Readable addresses: generated slugs, uniqueness, renames and redirects. Runs in a rolled-back
-- transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users(id) values
  ('f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002');

-- Products get a slug from their name, unique per kind.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select public.save_saas('f1000000-0000-4000-8000-000000000001', 'Slugtest Alpha',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, true, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000001'),
  'slugtest-alpha', 'a product gets a slug from its name');
select ok(
  (select slug ~ '^harbor-maker(-[0-9]+)?$' from public.profiles
    where id = 'f0000000-0000-4000-8000-000000000001'),
  'a maker without a name yet gets a slug from the default name');
select public.save_profile('Slugtest Zoë Ångström', '', '', '', '', '', '', '', '', '{}', null, '[]');
select is((select slug from public.profiles where id = 'f0000000-0000-4000-8000-000000000001'),
  'slugtest-zoe-angstrom', 'naming the profile gives it a slug without accents');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select public.save_saas('f1000000-0000-4000-8000-000000000002', 'SlugTest  alpha!',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000002'),
  'slugtest-alpha-2', 'the same name gets the next free number');
select public.save_saas('f1000000-0000-4000-8000-000000000003', '!!',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000003'),
  'product-f1000000', 'a name without letters or digits falls back to part of the id');
select public.save_saas('f1000000-0000-4000-8000-000000000004',
  'Slugtest ' || repeat('Very Long Name ', 4), 'Slug fixture',
  'A temporary fixture that is rolled back.', 'Other', 'https://example.com', null, null, false,
  false, false);
select ok(
  (select char_length(slug) <= 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' from public.saas
    where id = 'f1000000-0000-4000-8000-000000000004'),
  'long names are cut to a valid slug');

-- Makers cannot choose or change a slug.
select throws_ok(
  $$ update public.saas set slug = 'taken-over' where id = 'f1000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'makers cannot set a product slug');
select throws_ok(
  $$ update public.profiles set slug = 'taken-over' where id = 'f0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'makers cannot set their own slug');
select throws_ok('select count(*) from private.saas_slug_redirects', '42501', null,
  'makers cannot read the redirect list');

-- A renamed product keeps its old slug as a redirect; a renamed maker does not.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select public.save_saas('f1000000-0000-4000-8000-000000000001', 'Slugtest Beta',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, true, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000001'),
  'slugtest-beta', 'renaming a product gives it a new slug');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.saas_slug_redirect('slugtest-alpha'), 'slugtest-beta',
  'the old slug leads to the new one');
select is(public.saas_slug_redirect('SLUGTEST-ALPHA'), 'slugtest-beta',
  'redirects ignore letter case');
select is(public.saas_slug_redirect('slugtest-unknown'), null, 'unknown slugs lead nowhere');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select public.save_saas('f1000000-0000-4000-8000-000000000005', 'Slugtest Alpha',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000005'),
  'slugtest-alpha-3', 'a slug that redirects is not given to another product');
select public.save_saas('f1000000-0000-4000-8000-000000000002', 'SlugTest  alpha!',
  'Edited fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000002'),
  'slugtest-alpha-2', 'saving without a new name keeps the slug');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select public.save_saas('f1000000-0000-4000-8000-000000000001', 'Slugtest Alpha',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, true, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000001'),
  'slugtest-alpha', 'renaming back restores the original slug');
select is(public.saas_slug_redirect('slugtest-beta'), 'slugtest-alpha',
  'the intermediate slug now redirects');
select is(public.saas_slug_redirect('slugtest-alpha'), null,
  'the current slug is no longer a redirect');

select public.save_profile('Slugtest Someone Else', '', '', '', '', '', '', '', '', '{}', null, '[]');
select is((select slug from public.profiles where id = 'f0000000-0000-4000-8000-000000000001'),
  'slugtest-someone-else', 'renaming a maker gives a new slug');
reset role;
select is_empty($$ select 1 from public.profiles where slug = 'slugtest-zoe-angstrom' $$,
  'the maker''s old slug is released, not kept');

-- Hidden products do not resolve, and deleting a product frees its slugs.
reset role;
update public.saas set hidden_at = now(), hidden_reason = 'spam'
  where id = 'f1000000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.saas_slug_redirect('slugtest-beta'), null,
  'the old slug of a hidden product leads nowhere');
select is_empty($$ select 1 from public.public_saas where slug = 'slugtest-alpha' $$,
  'a hidden product is not found by its slug');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
delete from public.saas where id = 'f1000000-0000-4000-8000-000000000001';
reset role;
select is_empty(
  $$ select 1 from private.saas_slug_redirects where saas_id = 'f1000000-0000-4000-8000-000000000001' $$,
  'deleting a product removes its redirects');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select public.save_saas('f1000000-0000-4000-8000-000000000006', 'Slugtest Beta',
  'Slug fixture', 'A temporary fixture that is rolled back.', 'Other', 'https://example.com',
  null, null, false, false, false);
select is((select slug from public.saas where id = 'f1000000-0000-4000-8000-000000000006'),
  'slugtest-beta', 'a deleted product''s slugs are free again');

-- The public views carry both slugs.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select slug, owner_slug from public.public_saas where id = 'f1000000-0000-4000-8000-000000000006' $$,
  $$ values ('slugtest-beta'::text, (select slug from public.profiles
    where id = 'f0000000-0000-4000-8000-000000000002')) $$,
  'listings carry the product slug and the maker slug');

select * from finish();
rollback;

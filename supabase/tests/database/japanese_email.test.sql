-- The worker claims Japanese email choices and retains English for unsupported metadata.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
insert into auth.users(id, email, raw_user_meta_data) values
  ('ee100000-0000-4000-8000-000000000001', 'japanese-email@example.test', '{"locale":"ja"}'),
  ('ee100000-0000-4000-8000-000000000002', 'unsupported-email@example.test', '{"locale":"ja-JP"}');
insert into private.email_outbox(kind, user_id, topic, payload) values
  ('reports', 'ee100000-0000-4000-8000-000000000001', 'reports', '{}'),
  ('reports', 'ee100000-0000-4000-8000-000000000002', 'reports', '{}');
set local role service_role;
select results_eq($$ select email, locale from public.claim_emails(100, 0)
  where email in ('japanese-email@example.test', 'unsupported-email@example.test') order by email $$,
  $$ values ('japanese-email@example.test'::text, 'ja'::text), ('unsupported-email@example.test', 'en') $$,
  'Japanese is supported and invalid locale metadata falls back to English');
set local role authenticated;
select throws_ok($$ select * from public.claim_emails(100, 0) $$, '42501', null,
  'users still cannot claim notification emails');
select * from finish();
rollback;

-- The API roles hold exactly these privileges in the public schema. A new table, view, column or
-- function is reachable only after its grants are added here on purpose, so a migration that
-- forgets a revoke fails this suite. Runs in a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temp view pgtap_table_privileges as
select r.rolname::text collate "default" as role, c.relname::text collate "default" as relation,
  string_agg(p.priv, ',' order by p.priv) as privileges
from pg_class c
cross join (values ('anon'), ('authenticated')) r(rolname)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'),
  ('TRIGGER')) p(priv)
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
  and has_table_privilege(r.rolname, c.oid, p.priv)
group by r.rolname, c.relname;

create temp view pgtap_column_privileges as
select r.rolname::text collate "default" as role, c.relname::text collate "default" as relation, p.priv::text as privilege,
  string_agg(a.attname::text collate "default", ',' order by a.attname::text collate "default") as columns
from pg_class c
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join (values ('anon'), ('authenticated')) r(rolname)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(priv)
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p')
  and has_column_privilege(r.rolname, c.oid, a.attnum, p.priv)
  and not has_table_privilege(r.rolname, c.oid, p.priv)
group by r.rolname, c.relname, p.priv;

create temp view pgtap_function_privileges as
select r.rolname::text collate "default" as role,
  string_agg(p.proname::text collate "default", ',' order by p.proname::text collate "default") as functions
from pg_proc p
cross join (values ('anon'), ('authenticated')) r(rolname)
where p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'execute')
group by r.rolname;

select results_eq(
  $$ select relation, privileges from pgtap_table_privileges where role = 'anon' order by 1 $$,
  $$ values ('category_counts'::text, 'SELECT'::text), ('leaderboard', 'SELECT'),
    ('profile_experience', 'SELECT'), ('profiles', 'SELECT'), ('public_metrics', 'SELECT'),
    ('public_saas', 'SELECT'), ('saas', 'SELECT') $$,
  'visitors only read listings, products and profiles');
select results_eq(
  $$ select relation, privileges from pgtap_table_privileges where role = 'authenticated' order by 1 $$,
  $$ values ('blocks'::text, 'DELETE,INSERT,SELECT'::text), ('category_counts', 'SELECT'),
    ('conversation_reads', 'INSERT,SELECT'),
    ('conversations', 'SELECT'), ('inbox', 'SELECT'), ('leaderboard', 'SELECT'),
    ('messages', 'SELECT'), ('moderation_log', 'SELECT'), ('notification_settings', 'SELECT'),
    ('profile_experience', 'DELETE,INSERT,SELECT'), ('profiles', 'SELECT'),
    ('public_metrics', 'SELECT'), ('public_saas', 'SELECT'), ('reports', 'SELECT'),
    ('revenue_snapshots', 'SELECT'), ('saas', 'DELETE,SELECT'),
    ('saas_settings', 'INSERT,SELECT,UPDATE') $$,
  'makers hold only the table privileges the app uses');
select is_empty($$ select * from pgtap_column_privileges where role = 'anon' $$,
  'visitors hold no column privileges');
select results_eq(
  $$ select relation, privilege, columns from pgtap_column_privileges
     where role = 'authenticated' order by 1, 2 $$,
  $$ values ('conversation_reads'::text, 'UPDATE'::text, 'read_at'::text),
    ('profiles', 'INSERT', 'avatar_path,bio,github_url,headline,id,linkedin_url,location,name,skills,social_url,website,x_url'),
    ('profiles', 'UPDATE', 'avatar_path,bio,github_url,headline,linkedin_url,location,name,skills,social_url,updated_at,website,x_url'),
    ('revenue_connections', 'SELECT', 'connected_at,key_hint,last_error,last_synced_at,livemode,owner_id,provider,saas_id,status'),
    ('saas', 'INSERT', 'category,description,id,logo_path,name,owner_id,tagline,website'),
    ('saas', 'UPDATE', 'category,description,logo_path,name,tagline,updated_at,website') $$,
  'makers write only the columns they edit, and never read a stored key');
select results_eq(
  $$ select functions from pgtap_function_privileges where role = 'anon' $$,
  $$ values ('check_username,directory_stats,is_admin,saas_slug_redirect'::text) $$,
  'visitors run only the functions public pages need');
select results_eq(
  $$ select functions from pgtap_function_privileges where role = 'authenticated' $$,
  $$ values ('admin_account,admin_accounts,admin_dismiss_report,admin_hide_saas,admin_restore_account,admin_restore_saas,admin_suspend_account,begin_revenue_check,check_username,delete_account,directory_stats,is_admin,mark_conversation_read,saas_slug_redirect,save_notification_settings,save_profile,save_saas,send_message,set_username,submit_report,unread_message_count,username_change_available_at'::text) $$,
  'makers run only the functions the app calls');

select * from finish();
rollback;

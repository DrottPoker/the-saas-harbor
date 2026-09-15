begin;
insert into auth.users(id) values ('b0000000-0000-4000-8000-000000000001'), ('b0000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select public.save_saas('c0000000-0000-4000-8000-000000000001','SQL Test Private','Private fixture','A temporary fixture that is rolled back.','Other','https://example.com',null,99999900,99,'2026-01-01',false,false,false);
select public.save_saas('c0000000-0000-4000-8000-000000000002','SQL Test Small','Public fixture','A temporary fixture that is rolled back.','Other','https://example.com',null,1999,1,null,true,false,false);
select public.save_saas('c0000000-0000-4000-8000-000000000003','SQL Test Large','Public fixture','A temporary fixture that is rolled back.','Other','https://example.com',null,100000,2,null,true,true,false);
do $$
begin
  if (select count(*) from public.metric_reports) <> 3 then raise exception 'Owner history missing'; end if;
  if (select mrr_cents from public.public_saas where id = 'c0000000-0000-4000-8000-000000000001') is not null then raise exception 'Private MRR exposed to owner public view'; end if;
  begin
    update public.saas set owner_id = 'b0000000-0000-4000-8000-000000000002' where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'Owner transfer was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values ('profile-images','b0000000-0000-4000-8000-000000000002/forged.png');
    raise exception 'Foreign image upload was allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
do $$
declare affected integer;
begin
  if exists(select 1 from public.metric_reports) then raise exception 'Other owner history exposed'; end if;
  update public.saas set name = 'Hijacked' where id = 'c0000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign SaaS update allowed'; end if;
  update public.profiles set name = 'Hijacked' where id = 'b0000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign profile update allowed'; end if;
  update public.public_metrics set mrr_cents = 5 where saas_id = 'c0000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign public metric update allowed'; end if;
  begin
    perform public.save_saas('c0000000-0000-4000-8000-000000000001','Hijacked','Foreign edit attempt','A foreign owner should never change this product.','Other','https://example.com',null,1,null,null,true,false,false);
    raise exception 'Foreign RPC edit allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare ranks uuid[];
begin
  if (select count(*) from public.public_saas where id::text like 'c0000000-%') <> 3 then raise exception 'Private-MRR SaaS not discoverable'; end if;
  if exists(select 1 from public.public_saas where id = 'c0000000-0000-4000-8000-000000000001' and (mrr_cents is not null or customers is not null or launched_on is not null)) then raise exception 'Private metric leak'; end if;
  select array_agg(id order by rank) into ranks from public.leaderboard where id::text like 'c0000000-%';
  if ranks <> array['c0000000-0000-4000-8000-000000000003'::uuid,'c0000000-0000-4000-8000-000000000002'::uuid] then raise exception 'Ranking incorrect'; end if;
  begin perform count(*) from public.metric_reports; raise exception 'Anonymous history access allowed';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.save_saas(uuid,text,text,text,text,text,text,bigint,integer,date,boolean,boolean,boolean)','execute') then raise exception 'Anonymous RPC execute allowed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select public.save_saas('c0000000-0000-4000-8000-000000000003','SQL Test Large','Public fixture','A temporary fixture that is rolled back.','Other','https://example.com',null,100000,2,null,false,true,false);
select public.save_saas('c0000000-0000-4000-8000-000000000002','SQL Test Small','Public fixture','A temporary fixture that is rolled back.','Other','https://example.com',null,0,1,null,true,false,false);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists(select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000003') then raise exception 'Revoked MRR still ranked'; end if;
  if (select customers from public.public_saas where id = 'c0000000-0000-4000-8000-000000000003') <> 2 then raise exception 'Independent customer visibility broken'; end if;
  if not exists(select 1 from public.leaderboard where id = 'c0000000-0000-4000-8000-000000000002' and mrr_cents = 0) then raise exception 'Zero MRR missing'; end if;
end $$;
reset role;
rollback;
select 'PASS: owner access, foreign writes, storage ownership, private history, anonymous reads, ranking, zero MRR, revocation and independent visibility' as result;

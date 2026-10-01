-- IndexNow notices at most once an hour per product (the project review of 2026-10-01). Every save
-- told the search engines about the product's page, so a founder saving again and again, or a
-- script, could send them thousands of notices and get the site's key ignored. The time of the
-- last notice goes with the product.
create table private.index_notices (
  saas_id uuid primary key references public.saas(id) on delete cascade,
  sent_at timestamptz not null
);
alter table private.index_notices enable row level security;
revoke all on private.index_notices from public, anon, authenticated;

-- Whether the founder's save may announce the product's page now: true at most once an hour per
-- product, and only for the caller's own product.
create function public.claim_index_notice(p_saas uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.saas s where s.id = p_saas and s.owner_id = auth.uid()) then
    return false;
  end if;
  insert into private.index_notices(saas_id, sent_at) values (p_saas, now())
  on conflict (saas_id) do update set sent_at = excluded.sent_at
  where private.index_notices.sent_at <= now() - interval '1 hour';
  return found;
end;
$$;
revoke execute on function public.claim_index_notice(uuid) from public, anon;
grant execute on function public.claim_index_notice(uuid) to authenticated;

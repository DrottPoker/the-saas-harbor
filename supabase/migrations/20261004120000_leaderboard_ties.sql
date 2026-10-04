-- Equal amounts are ordered by revenue of all time before the date the product was listed, so a
-- product at $0 MRR that has sold something ranks above one that has not (the owner's request of
-- 2026-10-04). Products that do not share revenue of all time come last among their equals.
create or replace view public.leaderboard with (security_invoker = true) as
select row_number() over (
    order by mrr_cents desc, revenue_total_cents desc nulls last, created_at asc, id asc) as rank,
  s.*
from public.public_saas s where s.revenue_status = 'verified';

create or replace view public.revenue_leaderboard with (security_invoker = true) as
select
  case when s.revenue_30d_cents is not null then row_number() over (
    order by s.revenue_30d_cents desc nulls last, s.revenue_total_cents desc nulls last,
      s.created_at asc, s.id asc) end as rank_30d,
  case when s.revenue_12m_cents is not null then row_number() over (
    order by s.revenue_12m_cents desc nulls last, s.revenue_total_cents desc nulls last,
      s.created_at asc, s.id asc) end as rank_12m,
  case when s.revenue_total_cents is not null then row_number() over (
    order by s.revenue_total_cents desc nulls last, s.created_at asc, s.id asc) end as rank_total,
  s.*
from public.public_saas s
where s.revenue_30d_cents is not null or s.revenue_12m_cents is not null
  or s.revenue_total_cents is not null;

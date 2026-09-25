-- Listed and ranked products per category, for the category pages, the sitemap and llms.txt.
-- It reads public_saas with the caller's rights, so hidden products and suspended makers never
-- count, and a category without listed products has no row.
create view public.category_counts with (security_invoker = true) as
select category,
  count(*)::integer as products,
  (count(*) filter (where revenue_status = 'verified'))::integer as ranked
from public.public_saas
group by category;

grant select on public.category_counts to anon, authenticated;

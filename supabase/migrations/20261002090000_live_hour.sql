-- The live card covers the last 60 minutes instead of 30, at the owner's request. Visitors now
-- stay the last 5 minutes. Replacing the function keeps its grants.
create or replace function public.admin_analytics_live() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (
    with recent as materialized (
      select * from private.page_views v where v.created_at > now() - interval '60 minutes'
    )
    select jsonb_build_object(
      'current', (select count(distinct r.visitor) from recent r
        where r.created_at > now() - interval '5 minutes'),
      'visitors', (select count(distinct r.visitor) from recent r),
      'page_views', (select count(*) from recent r),
      'minutes', (select jsonb_agg(jsonb_build_object('ago', m.ago,
          'page_views', coalesce(c.page_views, 0), 'visitors', coalesce(c.visitors, 0))
          order by m.ago desc)
        from generate_series(0, 59) as m(ago)
        left join (
          select least(floor(extract(epoch from now() - r.created_at) / 60), 59)::integer as ago,
            count(*) as page_views, count(distinct r.visitor) as visitors
          from recent r group by 1
        ) c on c.ago = m.ago),
      'pages', (select coalesce(jsonb_agg(jsonb_build_object('value', t.path,
          'visitors', t.visitors) order by t.visitors desc, t.path), '[]'::jsonb)
        from (select r.path, count(distinct r.visitor) as visitors from recent r
          group by r.path order by visitors desc, r.path limit 8) t),
      'sources', (select coalesce(jsonb_agg(jsonb_build_object('value', t.source,
          'visits', t.visits) order by t.visits desc, t.source nulls first), '[]'::jsonb)
        from (select private.analytics_source(r.referrer, r.utm_source) as source,
            count(*) as visits
          from recent r where r.entry group by 1 order by visits desc, source nulls first
          limit 5) t),
      'countries', (select coalesce(jsonb_agg(jsonb_build_object('value', t.country,
          'visitors', t.visitors) order by t.visitors desc, t.country nulls last), '[]'::jsonb)
        from (select r.country, count(distinct r.visitor) as visitors from recent r
          group by r.country order by visitors desc, r.country nulls last limit 5) t))
  );
end;
$$;

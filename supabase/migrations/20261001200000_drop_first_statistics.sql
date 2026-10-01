-- The first version's statistics functions stayed only for the code that was live while the
-- detailed statistics (20260926070000), page time by key (20260927120000) and revenue from
-- payments (20260927170000) were deployed (known issue 20). That code has long been replaced:
-- page views go through track_page_view and track_page_time, reports through the
-- admin_analytics_* functions, and scheduled verification through claim_due_verifications.
drop function public.record_page_view(text, text, text, text, text, text, text, text, text, text, text);
drop function public.admin_analytics(timestamptz, timestamptz, text);
drop function public.track_engagement(text, text, bigint, integer);
drop function public.claim_due_connections(integer, interval);

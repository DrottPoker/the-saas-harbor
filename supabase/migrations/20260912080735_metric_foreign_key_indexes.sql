create index metric_reports_saas_owner_idx on public.metric_reports(saas_id, owner_id);
create index public_metrics_saas_owner_idx on public.public_metrics(saas_id, owner_id);

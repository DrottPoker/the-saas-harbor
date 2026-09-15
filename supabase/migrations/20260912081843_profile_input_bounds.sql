alter table public.profiles add constraint profiles_website_length check (char_length(website) <= 500), add constraint profiles_social_url_length check (char_length(social_url) <= 500), add constraint profiles_avatar_path_length check (char_length(avatar_path) <= 512);
alter table public.saas add constraint saas_logo_path_length check (char_length(logo_path) <= 512);
alter table public.metric_reports add constraint reports_launch_date_bounds check (launched_on between date '0001-01-01' and date '9999-12-31');
alter table public.public_metrics add constraint public_launch_date_bounds check (launched_on between date '0001-01-01' and date '9999-12-31');

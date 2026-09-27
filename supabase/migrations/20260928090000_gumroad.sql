-- Revenue can also be verified through Gumroad. Gumroad's personal access tokens can do anything
-- on the account, so a founder connects it through OAuth instead, granting the site a token that can
-- only view sales. The token is stored encrypted like any other key; everything else about
-- verification stays the same.
alter table public.revenue_connections
  drop constraint revenue_connections_provider_check,
  add constraint revenue_connections_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat', 'gumroad'));

alter table public.revenue_snapshots
  drop constraint revenue_snapshots_provider_check,
  add constraint revenue_snapshots_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat', 'gumroad'));

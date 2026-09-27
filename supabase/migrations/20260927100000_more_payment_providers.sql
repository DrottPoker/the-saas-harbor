-- Revenue can also be verified through Creem, Chargebee, Whop and RevenueCat. Connections and
-- snapshots accept their names; everything else about verification stays the same.
alter table public.revenue_connections
  drop constraint revenue_connections_provider_check,
  add constraint revenue_connections_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat'));

alter table public.revenue_snapshots
  drop constraint revenue_snapshots_provider_check,
  add constraint revenue_snapshots_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat'));

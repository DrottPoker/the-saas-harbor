-- Revenue can also be verified through PayPal (the owner's request of 2026-10-24). A founder makes
-- an app on PayPal whose only feature is Transaction search, and pastes its Client ID and secret,
-- which are stored encrypted together like any other key; everything else about verification
-- stays the same.
alter table public.revenue_connections
  drop constraint revenue_connections_provider_check,
  add constraint revenue_connections_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat', 'gumroad', 'paypal'));

alter table public.revenue_snapshots
  drop constraint revenue_snapshots_provider_check,
  add constraint revenue_snapshots_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat', 'gumroad', 'paypal'));

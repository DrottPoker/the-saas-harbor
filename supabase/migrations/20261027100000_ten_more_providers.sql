-- Ten more payment providers can verify revenue (the owner's request of 2026-10-27): AbacatePay,
-- Asaas, Paystack, Mollie, Airwallex, Superwall, the App Store, Zoho Billing, Mercado Pago and
-- Google Play. Each is read through a key or an approval that only reads, stored encrypted like any
-- other key; everything else about verification stays the same.
alter table public.revenue_connections
  drop constraint revenue_connections_provider_check,
  add constraint revenue_connections_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat', 'gumroad', 'paypal', 'abacatepay', 'asaas', 'paystack', 'mollie',
      'airwallex', 'superwall', 'appstore', 'zoho', 'mercadopago', 'googleplay'));

alter table public.revenue_snapshots
  drop constraint revenue_snapshots_provider_check,
  add constraint revenue_snapshots_provider_check
    check (provider in ('stripe', 'paddle', 'polar', 'dodo', 'creem', 'chargebee', 'whop',
      'revenuecat', 'gumroad', 'paypal', 'abacatepay', 'asaas', 'paystack', 'mollie',
      'airwallex', 'superwall', 'appstore', 'zoho', 'mercadopago', 'googleplay'));

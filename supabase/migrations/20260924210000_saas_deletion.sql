-- Makers can delete their own products. Foreign keys remove the settings, the public projection,
-- the verification snapshots and the Stripe connection with its encrypted key and subscription
-- claims, which frees the Stripe account to verify another product. The cascade runs as the
-- table owner, so makers still cannot write those tables directly. The app removes the logo
-- through the Storage API first.
grant delete on public.saas to authenticated;
create policy saas_owner_delete on public.saas for delete to authenticated
  using (owner_id = (select auth.uid()));

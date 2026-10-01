-- Two findings of the project review of 2026-10-01.

-- 1. Images go directly in the owner's folder, named as the app names them (src/lib/upload.ts).
-- The insert policy only checked the first folder, so the Storage API accepted files in subfolders
-- at any depth, which account deletion, listing five levels down, could leave behind. No file in
-- production was in a subfolder or named otherwise.
drop policy images_owner_insert on storage.objects;
create policy images_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$')
);

-- 2. A founder disconnects their payment provider through their own session, under RLS, instead of
-- through the service role. Deleting the connection deletes its key, subscription claims and
-- payments through their foreign keys, and its trigger refreshes the public projection.
grant delete on public.revenue_connections to authenticated;
create policy connections_owner_delete on public.revenue_connections for delete to authenticated
  using (owner_id = (select auth.uid()));

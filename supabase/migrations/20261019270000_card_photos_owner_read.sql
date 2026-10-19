-- Signed-in users can list only their own card-photos folder.
-- Avatars, covers, and post-images stay unlistable.
-- Buckets stay public so a direct object URL still loads.

drop policy if exists "Users can view own card photos" on storage.objects;
create policy "Users can view own card photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'card-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

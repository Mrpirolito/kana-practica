-- Uploading with upsert also needs read access to the user's own files
drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');

-- Optional banner picture (falls back to banner_color)
alter table public.profiles add column if not exists banner_url text;
update storage.buckets set file_size_limit = 4194304 where id = 'avatars';

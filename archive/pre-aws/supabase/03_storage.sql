-- Cumbre — Storage bucket for uploaded audio (apply AFTER schema.sql)
-- Audio is PRIVATE, accessed only via short-lived presigned URLs, and DELETED
-- after analysis (the worker stores features, never the audio). This bucket should
-- never be made public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'songs',
  'songs',
  false,
  52428800,  -- 50 MB cap (Phase 1)
  array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/flac','audio/mp4','audio/aac','audio/ogg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Per-user folder convention: objects live under '<user_id>/<song_id>.<ext>'.
-- Users may only touch their own folder; the service role (worker/webhook) bypasses RLS.

drop policy if exists "own songs upload" on storage.objects;
create policy "own songs upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'songs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own songs read" on storage.objects;
create policy "own songs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'songs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own songs delete" on storage.objects;
create policy "own songs delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'songs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

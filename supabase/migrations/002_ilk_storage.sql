-- İlk Durak — fotoğraf ve ses dosyaları
-- Dosyalar "ilk-media" kutusunda, <yolculuk-id>/<rastgele-ad> yolunda durur.
-- Okuma herkese açık ama yollar tahmin edilemez ve sadece durak açılınca alıcıya söylenir.
-- Yükleme ve silme sadece yolculuğun sahibine açık.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ilk-media', 'ilk-media', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp',
              'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ilk_media_insert on storage.objects;
create policy ilk_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ilk-media'
    and exists (select 1 from public.ilk_journeys j
                 where j.id::text = (storage.foldername(name))[1]
                   and j.owner_id = auth.uid()
                   and j.status in ('draft', 'active')));

drop policy if exists ilk_media_select on storage.objects;
create policy ilk_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'ilk-media'
    and exists (select 1 from public.ilk_journeys j
                 where j.id::text = (storage.foldername(name))[1] and j.owner_id = auth.uid()));

drop policy if exists ilk_media_delete on storage.objects;
create policy ilk_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'ilk-media'
    and exists (select 1 from public.ilk_journeys j
                 where j.id::text = (storage.foldername(name))[1] and j.owner_id = auth.uid()));

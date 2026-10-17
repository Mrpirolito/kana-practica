-- Limits enforced by the database, so they hold even if someone calls the API directly

-- Synced progress: at most 1 MB per user (real usage is a few KB)
alter table public.user_progress drop constraint if exists user_progress_data_size;
alter table public.user_progress add constraint user_progress_data_size
  check (pg_column_size(data) <= 1048576);

-- Profile fields: only hex colors, and images only from this project's storage
alter table public.profiles drop constraint if exists profiles_colors_hex;
alter table public.profiles add constraint profiles_colors_hex check (
  name_color ~ '^#[0-9a-fA-F]{6}$' and name_color2 ~ '^#[0-9a-fA-F]{6}$'
  and banner_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.profiles drop constraint if exists profiles_images_own_storage;
alter table public.profiles add constraint profiles_images_own_storage check (
  (avatar_url is null or avatar_url like 'https://ewmjaowzyupkjabukzae.supabase.co/storage/v1/object/public/avatars/' || id::text || '/%')
  and (banner_url is null or banner_url like 'https://ewmjaowzyupkjabukzae.supabase.co/storage/v1/object/public/avatars/' || id::text || '/%'));
alter table public.profiles drop constraint if exists profiles_username_chars;
alter table public.profiles add constraint profiles_username_chars
  check (username is null or username !~ '[<>"`]');

-- Timestamps come from the server clock, never from the client
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_progress_touch on public.user_progress;
create trigger user_progress_touch before insert or update on public.user_progress
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();

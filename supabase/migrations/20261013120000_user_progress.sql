-- One row per user with their full progress backup (see shared/utils/backup.ts)
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

-- Each user can only read and write their own row
drop policy if exists "own progress select" on public.user_progress;
create policy "own progress select" on public.user_progress
  for select using (auth.uid() = user_id);
drop policy if exists "own progress insert" on public.user_progress;
create policy "own progress insert" on public.user_progress
  for insert with check (auth.uid() = user_id);
drop policy if exists "own progress update" on public.user_progress;
create policy "own progress update" on public.user_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

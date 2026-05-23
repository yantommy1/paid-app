-- Long-lived API keys for Gmail Add-On / external clients (Bearer token).

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  key uuid not null unique,
  created_at timestamptz not null default now()
);

create index api_keys_user_id_idx on public.api_keys (user_id);

alter table public.api_keys enable row level security;

-- Browser sessions: users can read/delete their own keys (dashboard).
create policy "api_keys_select_own" on public.api_keys
  for select using (auth.uid() = user_id);

create policy "api_keys_delete_own" on public.api_keys
  for delete using (auth.uid() = user_id);

create policy "api_keys_insert_own" on public.api_keys
  for insert with check (auth.uid() = user_id);

-- Server uses service role to validate keys and manage rows where needed.

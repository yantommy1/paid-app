-- Defensive: ensure OAuth token columns exist (already in 20260418000000_initial.sql).
-- Safe to run on existing databases; no-op if columns are present.

alter table public.users add column if not exists quickbooks_token jsonb;
alter table public.users add column if not exists gmail_token jsonb;

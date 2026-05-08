-- 20260507000000_quickbooks_sync_error
-- Surface the most recent QuickBooks sync failure so the dashboard can show
-- a banner. Cleared on the next successful sync. Idempotent.

alter table public.users
  add column if not exists quickbooks_sync_error text,
  add column if not exists quickbooks_sync_error_at timestamptz,
  add column if not exists quickbooks_synced_at timestamptz;

comment on column public.users.quickbooks_sync_error is
  'Most recent QuickBooks sync error message (cleared on next successful sync).';
comment on column public.users.quickbooks_sync_error_at is
  'When the most recent QuickBooks sync error was recorded.';
comment on column public.users.quickbooks_synced_at is
  'When the most recent QuickBooks sync completed successfully.';

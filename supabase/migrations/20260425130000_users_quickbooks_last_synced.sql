-- Track last successful QuickBooks sync for dashboard summary
alter table public.users
  add column if not exists quickbooks_last_synced_at timestamptz;

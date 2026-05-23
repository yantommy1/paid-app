-- Perf + safety follow-up to the v2 audit (2026-05-22):
--
-- 1. Composite indexes on the hot invoice query paths. With only the
--    (user_id), (status), (lower(client_email)) singletons the planner has
--    to fall back to a seq scan + filter for the dashboard's
--    `WHERE user_id = ? AND status != 'paid' ORDER BY days_overdue DESC`
--    pattern. For a firm with 1k+ invoices that's noticeably slow on every
--    dashboard load and home-pack call.
--
-- 2. `processed_stripe_events` table for Stripe webhook idempotency. Stripe
--    retries on 5xx and may also redeliver on transient network blips;
--    `markInvoicePaidWithFees` is not currently safe against double delivery
--    so a redeliver could double-charge fees / double-credit a payment.

-- 1a. Hot invoice query — user's invoices ordered by lateness, status-filtered
create index if not exists idx_invoices_user_days_overdue
  on public.invoices (user_id, days_overdue desc);

-- 1b. Sync upsert + lookup-by-qbo-id (sync preservation, push-payment, etc.)
create index if not exists idx_invoices_user_qb_id
  on public.invoices (user_id, quickbooks_invoice_id);

-- 1c. Reply classifications by user — already filtered by user_id + created_at desc
create index if not exists idx_reply_classifications_user_created
  on public.reply_classifications (user_id, created_at desc);

-- 1d. Reminder schedules — cron pulls upcoming, active schedules
create index if not exists idx_reminder_schedules_user_scheduled
  on public.reminder_schedules (user_id, scheduled_for)
  where cancelled_at is null and fulfilled_at is null;

-- 2. Stripe webhook idempotency
create table if not exists public.processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  user_id uuid references public.users(id) on delete set null,
  processed_at timestamptz not null default now()
);

-- Used by the webhook to skip events older than ~30 days that are unlikely
-- to be retried, and to purge old rows via the cleanup cron.
create index if not exists idx_processed_stripe_events_processed_at
  on public.processed_stripe_events (processed_at desc);

-- Service role is what the webhook handler uses; no RLS needed for an
-- internal-only table, but explicit denial to anon keeps things tidy.
alter table public.processed_stripe_events enable row level security;

drop policy if exists "service role only" on public.processed_stripe_events;
create policy "service role only" on public.processed_stripe_events
  for all to service_role using (true) with check (true);

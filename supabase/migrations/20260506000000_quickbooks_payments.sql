-- Capture QuickBooks customer ref + track pushed payments so we can close
-- invoices in QB when a Stripe payment lands (or when the merchant manually
-- marks an invoice paid). Idempotent.

alter table public.invoices
  add column if not exists quickbooks_customer_id text,
  add column if not exists quickbooks_payment_id text,
  add column if not exists quickbooks_payment_pushed_at timestamptz;

comment on column public.invoices.quickbooks_customer_id is
  'QB CustomerRef.value captured during sync; required to post Payments back to QB.';
comment on column public.invoices.quickbooks_payment_id is
  'QB Payment.Id returned after a successful push; presence prevents duplicate Payment records.';
comment on column public.invoices.quickbooks_payment_pushed_at is
  'When the QB Payment was successfully created.';

-- Per-merchant toggle: auto-record payments in QuickBooks (default on).
alter table public.settings
  add column if not exists quickbooks_auto_record_payments boolean not null default true;

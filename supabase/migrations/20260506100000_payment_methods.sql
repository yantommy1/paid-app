-- Payment-method preferences for Stripe Checkout sessions: which methods the
-- merchant accepts. Both default true.

alter table public.settings
  add column if not exists accept_card boolean not null default true,
  add column if not exists accept_ach boolean not null default true;

comment on column public.settings.accept_card is
  'When true, Stripe Checkout offers card payments on the Pay Now flow.';
comment on column public.settings.accept_ach is
  'When true, Stripe Checkout offers ACH bank debit (us_bank_account).';

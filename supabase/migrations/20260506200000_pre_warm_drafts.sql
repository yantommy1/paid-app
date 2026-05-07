-- Cache pre-generated all-tone drafts on the invoice row so the Gmail Add-On
-- serves clicks from cache instead of triggering an LLM round-trip every time.
-- The daily cron refreshes this for every overdue invoice; the all-tones API
-- reads cache-first and only falls through to the LLM on cache miss.

alter table public.invoices
  add column if not exists draft_all_tones jsonb,
  add column if not exists draft_all_tones_at timestamptz,
  add column if not exists draft_auto_tone text;

comment on column public.invoices.draft_all_tones is
  'Cached {friendly:{subject,body,payNowIncluded}, professional:{...}, firm:{...}}.';
comment on column public.invoices.draft_all_tones_at is
  'When the cached drafts were generated. Stale after ~24h.';
comment on column public.invoices.draft_auto_tone is
  'Tone the auto-picker recommends for this invoice given client history + amount.';

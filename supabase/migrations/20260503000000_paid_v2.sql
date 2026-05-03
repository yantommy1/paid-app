-- Paid v2: A/E vertical, tone control, replies, payment links, bookkeeper sharing
-- Safe to run on existing databases; uses IF NOT EXISTS / IF EXISTS guards.

-- 1. Vertical tagging on users (engineering / architecture / environmental / etc.)
alter table public.users
  add column if not exists company_vertical text;

comment on column public.users.company_vertical is
  'Self-reported industry vertical for copy + reminder tuning (engineering, architecture, environmental, surveying, accounting, law, consulting, agency, construction, other)';

-- 2. Settings: tone defaults, payment-link config, early-pay discount, payment plan
alter table public.settings
  add column if not exists tone_default text not null default 'professional',
  add column if not exists tone_auto_adjust boolean not null default true,
  add column if not exists payment_link_enabled boolean not null default true,
  add column if not exists early_pay_discount_pct numeric(5, 2) not null default 0,
  add column if not exists early_pay_discount_days integer not null default 7,
  add column if not exists payment_plan_enabled boolean not null default false,
  add column if not exists payment_plan_installments integer not null default 3,
  add column if not exists pay_now_button_label text not null default 'Pay invoice online';

-- Validate tone_default values without breaking existing rows.
alter table public.settings
  drop constraint if exists settings_tone_default_check;
alter table public.settings
  add constraint settings_tone_default_check
  check (tone_default in ('friendly', 'professional', 'firm'));

-- 3. Per-invoice payment link configuration (overrides settings defaults at draft time)
alter table public.invoices
  add column if not exists pay_link_url text,
  add column if not exists pay_link_amount_cents integer,
  add column if not exists pay_link_discount_pct numeric(5, 2),
  add column if not exists pay_link_expires_at timestamptz,
  add column if not exists payment_plan_link_url text;

-- 4. Reply classifications (Gmail add-on processes a thread and writes one row per inbound message)
create table if not exists public.reply_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  thread_id text not null,
  message_id text,
  client_email text,
  classification text not null check (
    classification in (
      'will_pay_later',
      'cannot_pay',
      'invoice_issue',
      'payment_plan_request',
      'paid_already',
      'unrelated',
      'unknown'
    )
  ),
  promised_pay_date date,
  raw_excerpt text,
  suggested_action text,
  acted_on boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reply_classifications_user_id_idx on public.reply_classifications (user_id);
create index if not exists reply_classifications_invoice_id_idx on public.reply_classifications (invoice_id);
create index if not exists reply_classifications_thread_id_idx on public.reply_classifications (thread_id);

alter table public.reply_classifications enable row level security;

drop policy if exists reply_classifications_all_own on public.reply_classifications;
create policy reply_classifications_all_own on public.reply_classifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Scheduled follow-ups (when client says "will pay next week" we schedule the next nudge)
create table if not exists public.reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  scheduled_for date not null,
  reason text,
  source_classification_id uuid references public.reply_classifications (id) on delete set null,
  cancelled_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reminder_schedules_user_id_idx on public.reminder_schedules (user_id);
create index if not exists reminder_schedules_invoice_id_idx on public.reminder_schedules (invoice_id);
create index if not exists reminder_schedules_due_idx on public.reminder_schedules (scheduled_for)
  where cancelled_at is null and fulfilled_at is null;

alter table public.reminder_schedules enable row level security;

drop policy if exists reminder_schedules_all_own on public.reminder_schedules;
create policy reminder_schedules_all_own on public.reminder_schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 6. Bookkeeper invites: scoped magic-link delegation (read + draft approval, no settings)
create table if not exists public.bookkeeper_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  bookkeeper_email text not null,
  token uuid not null unique default gen_random_uuid(),
  permissions text not null default 'review' check (permissions in ('review', 'send')),
  accepted_at timestamptz,
  last_access_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default now() + interval '60 days',
  created_at timestamptz not null default now()
);

create index if not exists bookkeeper_invites_owner_idx on public.bookkeeper_invites (owner_user_id);
create index if not exists bookkeeper_invites_token_idx on public.bookkeeper_invites (token);

alter table public.bookkeeper_invites enable row level security;

drop policy if exists bookkeeper_invites_all_own on public.bookkeeper_invites;
create policy bookkeeper_invites_all_own on public.bookkeeper_invites
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 7. Tone snapshot per reminder (audit + future tuning)
alter table public.reminder_logs
  add column if not exists tone text,
  add column if not exists pay_link_included boolean not null default false,
  add column if not exists discount_pct numeric(5, 2),
  add column if not exists thread_id text;

-- 8. Belt-and-suspenders: ensure auto_send_enabled defaults FALSE for new accounts.
alter table public.settings
  alter column auto_send_enabled set default false;

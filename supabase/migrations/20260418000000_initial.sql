-- Paid — initial schema
-- Run in Supabase SQL editor or via supabase db push

-- Profiles / app users (1:1 with auth.users)
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  quickbooks_token jsonb,
  gmail_token jsonb,
  stripe_connect_account_id text,
  created_at timestamptz not null default now()
);

create index users_email_idx on public.users (email);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  quickbooks_invoice_id text not null,
  client_name text not null,
  client_email text not null,
  amount numeric(14, 2) not null,
  invoice_date date not null,
  due_date date not null,
  days_overdue integer not null default 0,
  status text not null check (
    status in ('current', 'overdue_30', 'overdue_60', 'overdue_90', 'paid')
  ),
  reminder_sent_at timestamptz,
  recovered_at timestamptz,
  recovery_mode boolean not null default false,
  reminder_pending boolean not null default false,
  reminder_draft text,
  unique (user_id, quickbooks_invoice_id)
);

create index invoices_user_id_idx on public.invoices (user_id);
create index invoices_client_email_idx on public.invoices (lower(client_email));
create index invoices_status_idx on public.invoices (status);

create table public.settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  auto_send_enabled boolean not null default false,
  fee_30_day numeric(5, 2) not null default 0,
  fee_60_day numeric(5, 2) not null default 5,
  fee_90_day numeric(5, 2) not null default 10
);

create table public.fees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  fee_percentage numeric(5, 2) not null,
  fee_amount numeric(14, 2) not null,
  collected_at timestamptz not null default now()
);

create index fees_user_id_idx on public.fees (user_id);

-- Reminder send audit log (Gmail add-on + API)
create table public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  channel text not null default 'api',
  subject text,
  sent_to text not null,
  created_at timestamptz not null default now()
);

create index reminder_logs_user_id_idx on public.reminder_logs (user_id);

-- Enable RLS
alter table public.users enable row level security;
alter table public.invoices enable row level security;
alter table public.settings enable row level security;
alter table public.fees enable row level security;
alter table public.reminder_logs enable row level security;

-- Policies: users own row
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

-- Invoices
create policy "invoices_all_own" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Settings
create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fees
create policy "fees_all_own" on public.fees
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reminder logs
create policy "reminder_logs_all_own" on public.reminder_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role bypasses RLS by default in Supabase

-- Trigger: create profile + settings on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  insert into public.settings (user_id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

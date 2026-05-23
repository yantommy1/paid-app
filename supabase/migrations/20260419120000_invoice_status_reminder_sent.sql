-- Allow invoices that have had a reminder sent (still unpaid in QuickBooks)
alter table public.invoices drop constraint if exists invoices_status_check;

alter table public.invoices add constraint invoices_status_check check (
  status in (
    'current',
    'overdue_30',
    'overdue_60',
    'overdue_90',
    'paid',
    'reminder_sent'
  )
);

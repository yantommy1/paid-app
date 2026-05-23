-- QuickBooks invoice detail for richer reminder copy

alter table public.invoices
  add column if not exists line_items text,
  add column if not exists memo text;

comment on column public.invoices.line_items is 'Concatenated QuickBooks Line descriptions (work performed)';
comment on column public.invoices.memo is 'QuickBooks CustomerMemo (invoice-level note to customer)';

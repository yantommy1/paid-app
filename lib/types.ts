import { z } from "zod";

export const InvoiceStatusSchema = z.enum([
  "current",
  "overdue_30",
  "overdue_60",
  "overdue_90",
  "paid",
  /** Unpaid; at least one reminder email was sent via Paid */
  "reminder_sent",
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export type QuickBooksToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  realm_id: string;
};

export type GmailToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export type InvoiceRow = {
  id: string;
  user_id: string;
  quickbooks_invoice_id: string;
  client_name: string;
  client_email: string;
  amount: number;
  invoice_date: string;
  due_date: string;
  days_overdue: number;
  status: InvoiceStatus;
  reminder_sent_at: string | null;
  recovered_at: string | null;
  recovery_mode: boolean;
  reminder_pending: boolean;
  reminder_draft: string | null;
  /** QuickBooks Line descriptions (work performed), synced from sync */
  line_items: string | null;
  /** QuickBooks CustomerMemo */
  memo: string | null;
};

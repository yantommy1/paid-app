import { fetchCustomerEmail, fetchUnpaidInvoices, type QbInvoice } from "@/lib/quickbooks/client";
import type { InvoiceStatus, QuickBooksToken } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape passed to `invoices` upsert from QuickBooks sync */
export type InvoiceUpsertRow = {
  user_id: string;
  quickbooks_invoice_id: string;
  client_name: string;
  client_email: string;
  amount: number;
  invoice_date: string;
  due_date: string;
  days_overdue: number;
  status: InvoiceStatus;
  recovery_mode: boolean;
};

/** Keep local “reminder sent” state across syncs until the invoice is paid in QuickBooks. */
async function applyReminderSentPreservation(
  supabase: SupabaseClient,
  userId: string,
  rows: InvoiceUpsertRow[]
): Promise<void> {
  const ids = rows.map((r) => r.quickbooks_invoice_id);
  if (ids.length === 0) return;

  const { data: existing } = await supabase
    .from("invoices")
    .select("quickbooks_invoice_id, reminder_sent_at")
    .eq("user_id", userId)
    .in("quickbooks_invoice_id", ids);

  const reminded = new Set(
    (existing ?? [])
      .filter((e) => e.reminder_sent_at != null)
      .map((e) => e.quickbooks_invoice_id as string)
  );

  for (const row of rows) {
    if (reminded.has(row.quickbooks_invoice_id)) {
      row.status = "reminder_sent";
    }
  }
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function statusFromDaysOverdue(d: number): InvoiceStatus {
  if (d >= 90) return "overdue_90";
  if (d >= 60) return "overdue_60";
  if (d >= 30) return "overdue_30";
  return "current";
}

export async function mapInvoiceToRow(
  inv: QbInvoice,
  userId: string,
  token: QuickBooksToken
): Promise<InvoiceUpsertRow> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = inv.DueDate ? new Date(inv.DueDate) : today;
  const invDate = inv.TxnDate ? new Date(inv.TxnDate) : due;
  const daysOverdue = daysBetween(due, today);
  const status = statusFromDaysOverdue(daysOverdue);
  const balance = Number(inv.Balance ?? inv.TotalAmt ?? 0);
  let email = inv.BillEmail?.Address?.trim() ?? "";
  if (!email && inv.CustomerRef?.value) {
    const fetched = await fetchCustomerEmail(token, inv.CustomerRef.value);
    email = fetched ?? "unknown@client.local";
  }
  if (!email) email = "unknown@client.local";

  return {
    user_id: userId,
    quickbooks_invoice_id: inv.Id,
    client_name: inv.CustomerRef?.name ?? "Client",
    client_email: email.toLowerCase(),
    amount: balance,
    invoice_date: invDate.toISOString().slice(0, 10),
    due_date: due.toISOString().slice(0, 10),
    days_overdue: daysOverdue,
    status,
    recovery_mode: daysOverdue >= 60,
  };
}

export async function syncInvoicesForUser(
  supabase: SupabaseClient,
  userId: string,
  token: QuickBooksToken
): Promise<{ upserted: number; overdueCount: number }> {
  const invoices = await fetchUnpaidInvoices(token);
  let overdueCount = 0;
  const rows: InvoiceUpsertRow[] = [];
  for (const inv of invoices) {
    const row = await mapInvoiceToRow(inv, userId, token);
    if (
      row.status === "overdue_30" ||
      row.status === "overdue_60" ||
      row.status === "overdue_90"
    ) {
      overdueCount++;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    return { upserted: 0, overdueCount: 0 };
  }

  await applyReminderSentPreservation(supabase, userId, rows);

  const { error } = await supabase.from("invoices").upsert(rows, {
    onConflict: "user_id,quickbooks_invoice_id",
  });
  if (error) throw new Error(`Invoice upsert failed: ${error.message}`);

  return { upserted: rows.length, overdueCount };
}

import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Recent reply classifications for the Activity feed in the Gmail Add-On.
 *
 * Returns up to 25 recent classifications (last 30 days), each enriched with
 * the matching invoice's client name, amount, days overdue, plus any scheduled
 * follow-up date.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: rows, error } = await supabase
    .from("reply_classifications")
    .select(
      "id, invoice_id, classification, promised_pay_date, raw_excerpt, suggested_action, acted_on, created_at, client_email, thread_id"
    )
    .eq("user_id", ctx.user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return serverError(error.message);
  }

  const invoiceIds = Array.from(
    new Set((rows ?? []).map((r) => r.invoice_id).filter((v): v is string => Boolean(v)))
  );

  let invoicesById: Record<
    string,
    { client_name: string; client_email: string; amount: number; days_overdue: number; quickbooks_invoice_id: string; status: string }
  > = {};

  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, client_name, client_email, amount, days_overdue, quickbooks_invoice_id, status")
      .in("id", invoiceIds)
      .eq("user_id", ctx.user.id);
    invoicesById = Object.fromEntries(
      (invs ?? []).map((i) => [
        i.id,
        {
          client_name: i.client_name,
          client_email: i.client_email,
          amount: Number(i.amount),
          days_overdue: i.days_overdue,
          quickbooks_invoice_id: i.quickbooks_invoice_id,
          status: i.status,
        },
      ])
    );
  }

  // Pending follow-ups for these invoices
  let nextFollowupByInvoice: Record<string, string> = {};
  if (invoiceIds.length > 0) {
    const { data: schedules } = await supabase
      .from("reminder_schedules")
      .select("invoice_id, scheduled_for")
      .eq("user_id", ctx.user.id)
      .in("invoice_id", invoiceIds)
      .is("cancelled_at", null)
      .is("fulfilled_at", null)
      .order("scheduled_for", { ascending: true });
    for (const s of schedules ?? []) {
      const id = (s as { invoice_id: string }).invoice_id;
      if (id && !nextFollowupByInvoice[id]) {
        nextFollowupByInvoice[id] = (s as { scheduled_for: string }).scheduled_for;
      }
    }
  }

  const items = (rows ?? []).map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    classification: r.classification,
    promisedPayDate: r.promised_pay_date,
    excerpt: r.raw_excerpt,
    suggestedAction: r.suggested_action,
    actedOn: r.acted_on,
    createdAt: r.created_at,
    clientEmail: r.client_email,
    threadId: r.thread_id,
    invoice: r.invoice_id ? invoicesById[r.invoice_id] ?? null : null,
    nextFollowup: r.invoice_id ? nextFollowupByInvoice[r.invoice_id] ?? null : null,
  }));

  return NextResponse.json({ items });
}

import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Full timeline for a single invoice — reminders sent, replies classified,
 * scheduled follow-ups. Drives the "View history" card in the Gmail Add-On.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const { invoiceId } = await params;

  const supabase = await createRouteHandlerClient(request);

  const { data: inv, error } = await supabase
    .from("invoices")
    .select(
      "id, client_name, client_email, amount, due_date, days_overdue, status, reminder_sent_at, recovered_at, quickbooks_invoice_id, draft_all_tones_at"
    )
    .eq("id", invoiceId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!inv) return notFound("Invoice not found");

  const [remindersRes, repliesRes, schedulesRes] = await Promise.all([
    supabase
      .from("reminder_logs")
      .select("id, channel, subject, sent_to, tone, pay_link_included, discount_pct, created_at, thread_id")
      .eq("user_id", ctx.user.id)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("reply_classifications")
      .select(
        "id, classification, promised_pay_date, suggested_action, raw_excerpt, created_at, thread_id"
      )
      .eq("user_id", ctx.user.id)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("reminder_schedules")
      .select("id, scheduled_for, reason, cancelled_at, fulfilled_at, created_at")
      .eq("user_id", ctx.user.id)
      .eq("invoice_id", invoiceId)
      .order("scheduled_for", { ascending: true }),
  ]);

  return NextResponse.json({
    invoice: {
      id: inv.id,
      clientName: inv.client_name,
      clientEmail: inv.client_email,
      amount: Number(inv.amount),
      dueDate: inv.due_date,
      daysOverdue: inv.days_overdue,
      status: inv.status,
      reminderSentAt: inv.reminder_sent_at,
      recoveredAt: inv.recovered_at,
      quickbooksInvoiceId: inv.quickbooks_invoice_id,
      draftReadyAt: inv.draft_all_tones_at,
    },
    reminders: remindersRes.data ?? [],
    replies: repliesRes.data ?? [],
    schedules: (schedulesRes.data ?? []).filter(
      (s) => !s.cancelled_at && !s.fulfilled_at
    ),
  });
}

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

  // Backfill orphan classifications: rows that were saved with invoice_id=null
  // because the prior /api/replies/classify call could not resolve the
  // client_email to an invoice (timing — reply arrived before sync; case or
  // whitespace mismatch on the email; QB sandbox edge cases). We re-link
  // them on every History open so the user never has to know orphans existed.
  //
  // Idempotent: after the first repair, no rows match `invoice_id IS NULL`
  // for this email, so subsequent opens are a no-op.
  const clientEmailNorm = (inv.client_email || "").trim().toLowerCase();
  if (clientEmailNorm) {
    await supabase
      .from("reply_classifications")
      .update({ invoice_id: invoiceId })
      .eq("user_id", ctx.user.id)
      .is("invoice_id", null)
      .ilike("client_email", clientEmailNorm);
  }

  // Diagnostic counts/samples were dropped in v1.6.4 — they were added
  // while debugging the contextual-classify silent failure (the GmailApp
  // 401 era), kept verbose copy in the History empty state, and made the
  // History endpoint do two extra Supabase round-trips per render. Now
  // that auto-classify is reliable the diagnostics aren't earning their
  // keep, so the response shape is back to the three primary queries.
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
      // 50 covers the longest real negotiation we'd expect for one invoice;
      // the "+N earlier" full-log card iterates over the array client-side
      // so this cap is also the hard ceiling on what's visible at all.
      .limit(50),
    supabase
      .from("reminder_schedules")
      .select("id, scheduled_for, reason, cancelled_at, fulfilled_at, created_at")
      .eq("user_id", ctx.user.id)
      .eq("invoice_id", invoiceId)
      .order("scheduled_for", { ascending: true }),
  ]);

  // Dedupe replies. Pre-v1.6.3 add-on bundles were keying the classify
  // dedupe by Gmail messageId instead of threadId, which meant each message
  // in the same conversation produced a fresh classification row — same
  // classification + same promised date, three copies. We dedupe on the
  // semantic shape of the row (classification + promised_pay_date) instead
  // of on thread_id alone, so the user's existing data gets cleaned up on
  // the read path even though all three rows have distinct thread_ids in
  // the DB. Keep the most recent in each group (results are already
  // ordered DESC by created_at).
  const rawReplies = repliesRes.data ?? [];
  const seenReplyKeys = new Set<string>();
  const dedupedReplies = rawReplies.filter((r) => {
    const key = `${r.classification || ""}|${r.promised_pay_date || ""}`;
    if (seenReplyKeys.has(key)) return false;
    seenReplyKeys.add(key);
    return true;
  });

  // Dedupe schedules on (scheduled_for, reason). Three identical
  // auto-follow-ups on the same date for the same invoice are wrong by
  // construction — the merchant only ever needs one row per planned
  // follow-up date.
  const rawSchedules = (schedulesRes.data ?? []).filter(
    (s) => !s.cancelled_at && !s.fulfilled_at
  );
  const seenScheduleKeys = new Set<string>();
  const dedupedSchedules = rawSchedules.filter((s) => {
    const key = `${s.scheduled_for ?? ""}|${(s.reason ?? "").slice(0, 80)}`;
    if (seenScheduleKeys.has(key)) return false;
    seenScheduleKeys.add(key);
    return true;
  });

  // No reminder dedupe here — each row in reminder_logs now represents a
  // *verified* send (Apps Script v1.6.4 confirms each draft made it to the
  // Sent folder before POSTing the log). Showing multiple rows is correct
  // when the merchant actually sent multiple reminders.
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
    replies: dedupedReplies,
    schedules: dedupedSchedules,
  });
}

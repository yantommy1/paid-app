import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Activity for a single client (by email): outstanding/recovered totals,
 * recent reminders sent, recent reply classifications. Drives the richer
 * Gmail Add-On contextual card after a reminder is sent (or any time the
 * user opens a thread with that contact).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({
      email: "",
      invoices: [],
      reminders: [],
      replies: [],
      totals: {
        outstanding: 0,
        recovered: 0,
        invoiceCount: 0,
        overdueCount: 0,
        remindersSent: 0,
        replyCount: 0,
      },
    });
  }

  const supabase = await createRouteHandlerClient(request);

  // Pull all invoices for this client (we'll bucket below).
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, client_name, amount, due_date, days_overdue, status, reminder_sent_at, recovered_at, quickbooks_invoice_id"
    )
    .eq("user_id", ctx.user.id)
    .ilike("client_email", email)
    .order("days_overdue", { ascending: false });

  if (invErr) return serverError(invErr.message);

  const invoiceIds = (invoices ?? []).map((i) => i.id);

  const [remindersRes, repliesRes] = await Promise.all([
    invoiceIds.length
      ? supabase
          .from("reminder_logs")
          .select("id, invoice_id, channel, subject, tone, sent_to, created_at, pay_link_included, discount_pct")
          .eq("user_id", ctx.user.id)
          .in("invoice_id", invoiceIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? supabase
          .from("reply_classifications")
          .select(
            "id, invoice_id, classification, promised_pay_date, suggested_action, raw_excerpt, created_at"
          )
          .eq("user_id", ctx.user.id)
          .in("invoice_id", invoiceIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const reminders = remindersRes.data ?? [];
  const replies = repliesRes.data ?? [];

  let outstanding = 0;
  let recovered = 0;
  let overdueCount = 0;
  for (const inv of invoices ?? []) {
    const amt = Number(inv.amount ?? 0);
    if (inv.status === "paid") {
      // Only count as recovered if a reminder was sent first
      if (inv.reminder_sent_at) recovered += amt;
    } else {
      outstanding += amt;
      if ((inv.days_overdue ?? 0) >= 1) overdueCount++;
    }
  }

  const clientName = invoices?.[0]?.client_name ?? null;

  return NextResponse.json({
    email,
    clientName,
    invoices: invoices ?? [],
    reminders,
    replies,
    totals: {
      outstanding: Math.round(outstanding * 100) / 100,
      recovered: Math.round(recovered * 100) / 100,
      invoiceCount: invoices?.length ?? 0,
      overdueCount,
      remindersSent: reminders.length,
      replyCount: replies.length,
    },
  });
}

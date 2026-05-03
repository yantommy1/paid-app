import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Dashboard ROI summary.
 * "Recovered" = paid invoices where Paid sent at least one reminder before payment.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: rows, error } = await supabase
    .from("invoices")
    .select("amount, recovered_at, reminder_sent_at, due_date, status")
    .eq("user_id", ctx.user.id)
    .eq("status", "paid")
    .not("reminder_sent_at", "is", null);

  if (error) {
    return serverError(error.message);
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let recoveredAllTime = 0;
  let recoveredThisMonth = 0;
  let count = 0;
  let totalDaysFromReminderToPayment = 0;
  let daysSamples = 0;

  for (const row of rows ?? []) {
    const amount = Number(row.amount ?? 0);
    recoveredAllTime += amount;
    count++;
    const recoveredAt = row.recovered_at ? new Date(row.recovered_at).getTime() : null;
    const reminderAt = row.reminder_sent_at ? new Date(row.reminder_sent_at).getTime() : null;
    if (recoveredAt && recoveredAt >= monthStart) {
      recoveredThisMonth += amount;
    }
    if (recoveredAt && reminderAt && recoveredAt > reminderAt) {
      totalDaysFromReminderToPayment += (recoveredAt - reminderAt) / 86400000;
      daysSamples++;
    }
  }

  const avgDaysFromReminderToPayment = daysSamples > 0
    ? Math.round((totalDaysFromReminderToPayment / daysSamples) * 10) / 10
    : null;

  // Pending follow-ups for context
  const { count: queuedCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .eq("reminder_pending", true);

  return NextResponse.json({
    recoveredAllTime: Math.round(recoveredAllTime * 100) / 100,
    recoveredThisMonth: Math.round(recoveredThisMonth * 100) / 100,
    invoicesRecoveredCount: count,
    avgDaysFromReminderToPayment,
    remindersQueuedNow: queuedCount ?? 0,
  });
}

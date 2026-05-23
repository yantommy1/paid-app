import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

type InvoiceRow = {
  amount: number | string | null;
  status: string | null;
  reminder_sent_at: string | null;
  recovered_at: string | null;
  days_overdue: number | null;
};

export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: rows, error } = await supabase
    .from("invoices")
    .select("amount,status,reminder_sent_at,recovered_at,days_overdue")
    .eq("user_id", ctx.user.id);

  if (error) return serverError(error.message);

  let totalOutstanding = 0;
  let remindersSent = 0;
  let amountRecovered = 0;
  let recoveredDaysSum = 0;
  let recoveredCount = 0;

  for (const row of (rows ?? []) as InvoiceRow[]) {
    const amount = Number(row.amount ?? 0);
    const isRecovered = row.recovered_at != null;
    const isOpen = !isRecovered && row.status !== "paid";

    if (isOpen) totalOutstanding += amount;
    if (row.reminder_sent_at != null) remindersSent += 1;
    if (isRecovered) {
      amountRecovered += amount;
      recoveredDaysSum += Number(row.days_overdue ?? 0);
      recoveredCount += 1;
    }
  }

  return NextResponse.json({
    totalOutstanding,
    remindersSent,
    amountRecovered,
    avgDaysToCollect: recoveredCount > 0 ? Math.round(recoveredDaysSum / recoveredCount) : 0,
  });
}

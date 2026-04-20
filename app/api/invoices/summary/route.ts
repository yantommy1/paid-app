import { computeCohorts, computeSidebarHeader } from "@/lib/invoices/sidebar-stats";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/** Cohort totals (+ optional header stats) for dashboards */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const [{ data: rows, error: invError }, { data: userRow, error: userError }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("amount, days_overdue, status, client_email")
        .eq("user_id", ctx.user.id)
        .neq("status", "paid"),
      supabase
        .from("users")
        .select("quickbooks_last_synced_at")
        .eq("id", ctx.user.id)
        .maybeSingle(),
    ]);

  if (invError) {
    return NextResponse.json({ error: invError.message }, { status: 500 });
  }
  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  const list = rows ?? [];
  const cohorts = computeCohorts(list);
  const header = computeSidebarHeader(list);

  let overdueInvoiceCount = 0;
  for (const r of list) {
    if (r.days_overdue > 0) overdueInvoiceCount++;
  }

  const lastSyncedAt =
    userRow &&
    typeof userRow === "object" &&
    "quickbooks_last_synced_at" in userRow &&
    userRow.quickbooks_last_synced_at != null
      ? String(userRow.quickbooks_last_synced_at)
      : null;

  return NextResponse.json({
    cohorts,
    header,
    overdueInvoiceCount,
    lastSyncedAt,
  });
}

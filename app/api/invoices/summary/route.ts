import { computeCohorts, computeSidebarHeader } from "@/lib/invoices/sidebar-stats";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: rows, error } = await supabase
    .from("invoices")
    .select("amount, days_overdue, status, client_email")
    .eq("user_id", ctx.user.id)
    .neq("status", "paid");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const cohorts = computeCohorts(list);
  const header = computeSidebarHeader(list);
  const overdueInvoiceCount = list.filter((r) => r.days_overdue > 0).length;

  return NextResponse.json({
    cohorts,
    header,
    overdueInvoiceCount,
    lastSyncedAt: null,
  });
}

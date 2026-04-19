import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/** Cohort totals for Gmail sidebar */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: rows, error } = await supabase
    .from("invoices")
    .select("amount, days_overdue, status")
    .eq("user_id", ctx.user.id)
    .neq("status", "paid");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cohorts = {
    current: { count: 0, total: 0 },
    d30: { count: 0, total: 0 },
    d60: { count: 0, total: 0 },
    d90: { count: 0, total: 0 },
  };

  for (const r of rows ?? []) {
    const amt = Number(r.amount);
    if (r.days_overdue >= 90 || r.status === "overdue_90") {
      cohorts.d90.count++;
      cohorts.d90.total += amt;
    } else if (r.days_overdue >= 60 || r.status === "overdue_60") {
      cohorts.d60.count++;
      cohorts.d60.total += amt;
    } else if (r.days_overdue >= 30 || r.status === "overdue_30") {
      cohorts.d30.count++;
      cohorts.d30.total += amt;
    } else {
      cohorts.current.count++;
      cohorts.current.total += amt;
    }
  }

  return NextResponse.json({ cohorts });
}

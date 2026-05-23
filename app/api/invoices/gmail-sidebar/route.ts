import { computeCohorts, computeSidebarHeader } from "@/lib/invoices/sidebar-stats";
import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Single payload for Gmail add-on home: cohorts, header stats, full invoice rows.
 * Avoids multiple round-trips from Apps Script.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: rows, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", ctx.user.id)
    .neq("status", "paid")
    .order("days_overdue", { ascending: false });

  if (error) {
    return serverError(error.message);
  }

  const list = rows ?? [];
  const cohorts = computeCohorts(list);
  const header = computeSidebarHeader(list);

  return NextResponse.json({
    cohorts,
    header,
    invoices: list,
    user_email: ctx.user.email ?? "",
  });
}

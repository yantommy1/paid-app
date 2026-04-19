import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/** Gmail Add-On: outstanding invoices for an email address */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email query required" }, { status: 400 });
  }

  const supabase = await createRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, client_name, quickbooks_invoice_id, amount, days_overdue, status, due_date"
    )
    .eq("user_id", ctx.user.id)
    .eq("client_email", email)
    .neq("status", "paid");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invoices: data ?? [] });
}

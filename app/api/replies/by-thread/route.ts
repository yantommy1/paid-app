import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lookup classifications for an open Gmail thread.
 * Used by the Add-On contextual card to show "we already classified this" continuity.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json({ items: [] });
  }

  const supabase = await createRouteHandlerClient(request);
  const { data: rows, error } = await supabase
    .from("reply_classifications")
    .select(
      "id, invoice_id, classification, promised_pay_date, raw_excerpt, suggested_action, created_at"
    )
    .eq("user_id", ctx.user.id)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return serverError(error.message);
  }

  const items = (rows ?? []).map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    classification: r.classification,
    promisedPayDate: r.promised_pay_date,
    excerpt: r.raw_excerpt,
    suggestedAction: r.suggested_action,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ items });
}

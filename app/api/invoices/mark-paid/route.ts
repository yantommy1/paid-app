import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { markInvoicePaidWithFees } from "@/lib/fees/mark-invoice-paid";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createRouteHandlerClient(request);

  try {
    const result = await markInvoicePaidWithFees(supabase, {
      userId: ctx.user.id,
      invoiceId: parsed.data.invoiceId,
    });
    return NextResponse.json({
      ok: result.ok,
      feePercentage: result.feePercentage,
      feeAmount: result.feeAmount,
      skipped: result.skipped,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    const status = message === "Invoice not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

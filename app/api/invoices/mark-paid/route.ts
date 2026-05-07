import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { markInvoicePaidWithFees } from "@/lib/fees/mark-invoice-paid";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  paymentMethod: z.enum(["manual", "ach", "check", "other"]).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return serverError("Invalid payload", 400);
  }

  const supabase = await createRouteHandlerClient(request);

  try {
    const result = await markInvoicePaidWithFees(supabase, {
      userId: ctx.user.id,
      invoiceId: parsed.data.invoiceId,
      paymentMethod: parsed.data.paymentMethod ?? "manual",
    });
    return NextResponse.json({
      ok: result.ok,
      feePercentage: result.feePercentage,
      feeAmount: result.feeAmount,
      skipped: result.skipped,
      quickbooksPushed: result.quickbooksPushed,
      quickbooksError: result.quickbooksError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    const status = message === "Invoice not found" ? 404 : 500;
    if (status === 404) return notFound(message);
    return serverError(message);
  }
}

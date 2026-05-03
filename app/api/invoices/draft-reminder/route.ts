import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  senderName: z.string().min(1).max(120).optional(),
  tone: z.enum(["friendly", "professional", "firm"]).optional(),
  discountPct: z.number().min(0).max(50).nullable().optional(),
  paymentPlanEnabled: z.boolean().nullable().optional(),
  disablePayLink: z.boolean().optional(),
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
  const { data: inv, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.user.id)
    .single();

  if (error || !inv) {
    return notFound("Invoice not found");
  }

  const senderName = parsed.data.senderName ?? getUserDisplayName(ctx.user);

  try {
    const built = await buildReminderForInvoice(
      supabase,
      ctx.user.id,
      inv,
      senderName,
      {
        toneOverride: parsed.data.tone,
        discountPctOverride: parsed.data.discountPct,
        paymentPlanOverride: parsed.data.paymentPlanEnabled,
        disablePayLink: parsed.data.disablePayLink,
      }
    );
    return NextResponse.json({
      subject: built.subject,
      body: built.body,
      tone: built.tone,
      payNowUrl: built.payNowUrl,
      payNowIncluded: built.payNowIncluded,
      discountPct: built.discountPct,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft failed";
    return serverError(message);
  }
}

import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { buildGmailComposeUrl } from "@/lib/gmail/send";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Approve a reminder and prepare it for the merchant to send themselves.
 *
 * Paid never calls gmail.send. This endpoint:
 *   1) Builds (or accepts) the subject + body.
 *   2) Marks the invoice as reminder_sent (optimistic — based on user click).
 *   3) Records a reminder_logs row with channel='gmail-compose'.
 *   4) Returns a Gmail compose URL the client can open so the user clicks Send in Gmail.
 */
const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  subject: z.string().optional(),
  body: z.string().optional(),
  channel: z.enum(["web", "addon"]).optional(),
  tone: z.enum(["friendly", "professional", "firm"]).optional(),
  payNowIncluded: z.boolean().optional(),
  discountPct: z.number().nullable().optional(),
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

  const senderName = getUserDisplayName(ctx.user);
  let subject = parsed.data.subject;
  let body = parsed.data.body;
  let tone: string | null = parsed.data.tone ?? null;
  let payNowIncluded = parsed.data.payNowIncluded ?? false;
  let discountPct: number | null = parsed.data.discountPct ?? null;

  if (!subject || !body) {
    const built = await buildReminderForInvoice(supabase, ctx.user.id, inv, senderName, {
      toneOverride: parsed.data.tone,
    });
    subject = subject ?? built.subject;
    body = body ?? built.body;
    tone = tone ?? built.tone;
    payNowIncluded = payNowIncluded || built.payNowIncluded;
    discountPct = discountPct ?? built.discountPct;
  }

  const compose = buildGmailComposeUrl({
    to: inv.client_email,
    subject: subject!,
    bodyText: body!,
  });

  const now = new Date().toISOString();
  await supabase
    .from("invoices")
    .update({
      status: "reminder_sent",
      reminder_sent_at: now,
      reminder_pending: false,
      reminder_draft: null,
    })
    .eq("id", inv.id);

  await supabase.from("reminder_logs").insert({
    user_id: ctx.user.id,
    invoice_id: inv.id,
    channel: "gmail-compose",
    subject,
    sent_to: inv.client_email,
    tone,
    pay_link_included: payNowIncluded,
    discount_pct: discountPct,
  });

  return NextResponse.json({
    ok: true,
    composeUrl: compose.url,
    bodyTruncated: compose.bodyTruncated,
    sentAt: now,
    tone,
    payNowIncluded,
  });
}

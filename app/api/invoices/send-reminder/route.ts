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

  // Fast path: the add-on always sends subject+body+tone from its local cache.
  // We only need the client_email to build a compose URL — slim the read.
  // The legacy "build the draft on demand" branch still works for callers that
  // pass invoiceId only, but it falls through to the heavy path below.
  let subject = parsed.data.subject;
  let body = parsed.data.body;
  let tone: string | null = parsed.data.tone ?? null;
  let payNowIncluded = parsed.data.payNowIncluded ?? false;
  let discountPct: number | null = parsed.data.discountPct ?? null;

  let clientEmail: string;

  if (subject && body) {
    // Slim read — just the client_email.
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("client_email")
      .eq("id", parsed.data.invoiceId)
      .eq("user_id", ctx.user.id)
      .single();
    if (error || !inv) {
      return notFound("Invoice not found");
    }
    clientEmail = inv.client_email;
  } else {
    // Heavy path — pull full row so we can rebuild the draft.
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
    const built = await buildReminderForInvoice(supabase, ctx.user.id, inv, senderName, {
      toneOverride: parsed.data.tone,
    });
    subject = subject ?? built.subject;
    body = body ?? built.body;
    tone = tone ?? built.tone;
    payNowIncluded = payNowIncluded || built.payNowIncluded;
    discountPct = discountPct ?? built.discountPct;
    clientEmail = inv.client_email;
  }

  const compose = buildGmailComposeUrl({
    to: clientEmail,
    subject: subject!,
    bodyText: body!,
  });

  const now = new Date().toISOString();

  // Parallelize the two writes — they don't depend on each other.
  await Promise.all([
    supabase
      .from("invoices")
      .update({
        status: "reminder_sent",
        reminder_sent_at: now,
        reminder_pending: false,
        reminder_draft: null,
      })
      .eq("id", parsed.data.invoiceId),
    supabase.from("reminder_logs").insert({
      user_id: ctx.user.id,
      invoice_id: parsed.data.invoiceId,
      channel: parsed.data.channel ? "gmail-compose-" + parsed.data.channel : "gmail-compose",
      subject,
      sent_to: clientEmail,
      tone,
      pay_link_included: payNowIncluded,
      discount_pct: discountPct,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    composeUrl: compose.url,
    bodyTruncated: compose.bodyTruncated,
    sentAt: now,
    tone,
    payNowIncluded,
  });
}

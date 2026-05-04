import { resolveBookkeeperToken } from "@/lib/bookkeeper/token";
import { serverError, unauthorized, notFound } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Bookkeeper "approve" — Paid does not call gmail.send.
 *
 * The bookkeeper marks the draft as approved-and-ready. The owner sees the
 * approved draft in their Gmail Add-On home card and clicks "Open in Gmail"
 * to send. This avoids using the owner's gmail.send token (which Paid no
 * longer holds) and keeps human approval in the loop.
 */
const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1),
  tone: z.enum(["friendly", "professional", "firm"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ctx = await resolveBookkeeperToken(token);
  if (!ctx) return unauthorized();
  if (ctx.permissions !== "send") {
    return serverError("This bookkeeper link is read-only.", 403);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return serverError("Invalid payload", 400);

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.ownerUserId)
    .maybeSingle();

  if (!inv) return notFound("Invoice not found");

  // Mark the draft as approved + queued for the owner to send from Gmail.
  await admin
    .from("invoices")
    .update({
      reminder_pending: true,
      reminder_draft: JSON.stringify({
        subject: parsed.data.subject,
        body: parsed.data.body,
        tone: parsed.data.tone ?? null,
        approvedByBookkeeper: ctx.bookkeeperEmail,
        approvedAt: new Date().toISOString(),
      }),
    })
    .eq("id", inv.id);

  await admin.from("reminder_logs").insert({
    user_id: ctx.ownerUserId,
    invoice_id: inv.id,
    channel: "bookkeeper-approved",
    subject: parsed.data.subject,
    sent_to: inv.client_email,
    tone: parsed.data.tone ?? null,
  });

  return NextResponse.json({
    ok: true,
    message:
      "Approved. The owner will see this in their Paid Gmail Add-On and can open it in Gmail to send.",
  });
}

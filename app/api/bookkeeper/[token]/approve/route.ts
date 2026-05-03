import { resolveBookkeeperToken } from "@/lib/bookkeeper/token";
import { serverError, unauthorized, notFound } from "@/lib/api/errors";
import { sendGmailMessage } from "@/lib/gmail/send";
import { ensureGmailToken } from "@/lib/oauth/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GmailToken } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

  const { data: owner } = await admin
    .from("users")
    .select("gmail_token")
    .eq("id", ctx.ownerUserId)
    .maybeSingle();

  const gmailToken = owner?.gmail_token as unknown as GmailToken | null;
  const fresh = await ensureGmailToken(gmailToken);
  if (!fresh) {
    return serverError(
      "The owner's Gmail connection has expired. Ask them to reconnect Gmail in Paid before approving more reminders.",
      400
    );
  }

  await admin
    .from("users")
    .update({ gmail_token: fresh as unknown as Record<string, unknown> })
    .eq("id", ctx.ownerUserId);

  try {
    const sent = await sendGmailMessage(fresh, inv.client_email, parsed.data.subject, parsed.data.body);
    const now = new Date().toISOString();
    await admin
      .from("invoices")
      .update({
        status: "reminder_sent",
        reminder_sent_at: now,
        reminder_pending: false,
        reminder_draft: null,
      })
      .eq("id", inv.id);

    await admin.from("reminder_logs").insert({
      user_id: ctx.ownerUserId,
      invoice_id: inv.id,
      channel: "bookkeeper",
      subject: parsed.data.subject,
      sent_to: inv.client_email,
      tone: parsed.data.tone ?? null,
    });

    return NextResponse.json({ ok: true, messageId: sent.id, sentAt: now });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    return serverError(message);
  }
}

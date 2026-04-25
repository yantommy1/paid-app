import { draftReminderEmail } from "@/lib/anthropic/draft";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { sendGmailMessage } from "@/lib/gmail/send";
import { ensureGmailToken } from "@/lib/oauth/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import type { GmailToken } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  subject: z.string().optional(),
  body: z.string().optional(),
  channel: z.enum(["web", "addon"]).optional(),
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

  const { data: userRow } = await supabase
    .from("users")
    .select("gmail_token")
    .eq("id", ctx.user.id)
    .single();

  const gmailToken = userRow?.gmail_token as unknown as GmailToken | null;
  const fresh = await ensureGmailToken(gmailToken);
  if (!fresh) {
    return serverError("Gmail not connected or token expired — reconnect.", 400);
  }

  const admin = createAdminClient();
  await admin
    .from("users")
    .update({ gmail_token: fresh as unknown as Record<string, unknown> })
    .eq("id", ctx.user.id);

  const ownerName = ctx.user.email?.split("@")[0] ?? "there";
  let subject = parsed.data.subject;
  let body = parsed.data.body;

  if (!subject || !body) {
    const draft = await draftReminderEmail(
      {
        client_name: inv.client_name,
        amount: inv.amount,
        days_overdue: inv.days_overdue,
        due_date: inv.due_date,
        quickbooks_invoice_id: inv.quickbooks_invoice_id,
        line_items: inv.line_items ?? null,
        memo: inv.memo ?? null,
      },
      ownerName
    );
    subject = subject ?? draft.subject;
    body = body ?? draft.body;
  }

  try {
    const sent = await sendGmailMessage(fresh, inv.client_email, subject!, body!);
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
      channel: parsed.data.channel ?? "web",
      subject,
      sent_to: inv.client_email,
    });

    return NextResponse.json({
      ok: true,
      messageId: sent.id,
      sentAt: now,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    return serverError(message);
  }
}

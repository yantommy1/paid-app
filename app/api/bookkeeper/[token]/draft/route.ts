import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { displayNameFromEmail } from "@/lib/auth/display-name";
import { resolveBookkeeperToken } from "@/lib/bookkeeper/token";
import { serverError, unauthorized, notFound } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  tone: z.enum(["friendly", "professional", "firm"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ctx = await resolveBookkeeperToken(token);
  if (!ctx) return unauthorized();

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
    .select("email")
    .eq("id", ctx.ownerUserId)
    .maybeSingle();
  const senderName = displayNameFromEmail(owner?.email ?? null);

  try {
    const built = await buildReminderForInvoice(admin, ctx.ownerUserId, inv, senderName, {
      toneOverride: parsed.data.tone,
    });
    // Cache the draft on the invoice so the owner sees the same one in their queue.
    await admin
      .from("invoices")
      .update({
        reminder_pending: true,
        reminder_draft: JSON.stringify({
          subject: built.subject,
          body: built.body,
          tone: built.tone,
          payNowIncluded: built.payNowIncluded,
        }),
      })
      .eq("id", inv.id);

    return NextResponse.json({
      subject: built.subject,
      body: built.body,
      tone: built.tone,
      payNowIncluded: built.payNowIncluded,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft failed";
    return serverError(message);
  }
}

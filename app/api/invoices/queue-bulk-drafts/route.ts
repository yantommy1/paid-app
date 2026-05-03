import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Build AI drafts for all invoices 30+ days overdue (review queue — does not send).
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", ctx.user.id)
    .gte("days_overdue", 30)
    .neq("status", "paid")
    .neq("status", "reminder_sent");

  if (error) {
    return serverError(error.message);
  }

  const senderName = getUserDisplayName(ctx.user);
  const queue: {
    invoiceId: string;
    clientName: string;
    clientEmail: string;
    amount: number;
    daysOverdue: number;
    subject: string;
    body: string;
    tone: string;
    payNowIncluded: boolean;
  }[] = [];

  for (const inv of invoices ?? []) {
    try {
      const built = await buildReminderForInvoice(supabase, ctx.user.id, inv, senderName);
      queue.push({
        invoiceId: inv.id,
        clientName: inv.client_name,
        clientEmail: inv.client_email,
        amount: Number(inv.amount),
        daysOverdue: inv.days_overdue,
        subject: built.subject,
        body: built.body,
        tone: built.tone,
        payNowIncluded: built.payNowIncluded,
      });
      await supabase
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
    } catch {
      // continue other invoices
    }
  }

  return NextResponse.json({ queue });
}

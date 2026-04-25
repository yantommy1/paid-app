import { draftReminderEmail } from "@/lib/anthropic/draft";
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

  const ownerName = ctx.user.email?.split("@")[0] ?? "there";
  const queue: {
    invoiceId: string;
    clientName: string;
    clientEmail: string;
    amount: number;
    daysOverdue: number;
    subject: string;
    body: string;
  }[] = [];

  for (const inv of invoices ?? []) {
    try {
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
      queue.push({
        invoiceId: inv.id,
        clientName: inv.client_name,
        clientEmail: inv.client_email,
        amount: Number(inv.amount),
        daysOverdue: inv.days_overdue,
        subject: draft.subject,
        body: draft.body,
      });
      await supabase
        .from("invoices")
        .update({
          reminder_pending: true,
          reminder_draft: JSON.stringify(draft),
        })
        .eq("id", inv.id);
    } catch {
      // continue other invoices
    }
  }

  return NextResponse.json({ queue });
}

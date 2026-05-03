import { classifyReply } from "@/lib/anthropic/classify-reply";
import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid().optional(),
  threadId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  clientEmail: z.string().email().optional(),
  replyText: z.string().min(1).max(10000),
});

const FOLLOWUP_BUFFER_DAYS = 3;

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

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
  if (!parsed.success) return serverError("Invalid payload", 400);

  const supabase = await createRouteHandlerClient(request);

  // Look up invoice for context if we have an id.
  let invoiceContext: { amount: number; daysOverdue: number; quickbooksInvoiceId: string } | null = null;
  let invoiceId: string | null = parsed.data.invoiceId ?? null;
  if (invoiceId) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, amount, days_overdue, quickbooks_invoice_id")
      .eq("id", invoiceId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (inv) {
      invoiceContext = {
        amount: Number(inv.amount),
        daysOverdue: inv.days_overdue,
        quickbooksInvoiceId: inv.quickbooks_invoice_id,
      };
    } else {
      invoiceId = null;
    }
  }

  // Or look up by client email if no invoice id supplied (best-match: most overdue open invoice).
  if (!invoiceId && parsed.data.clientEmail) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, amount, days_overdue, quickbooks_invoice_id")
      .eq("user_id", ctx.user.id)
      .ilike("client_email", parsed.data.clientEmail.toLowerCase())
      .neq("status", "paid")
      .order("days_overdue", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inv) {
      invoiceId = inv.id;
      invoiceContext = {
        amount: Number(inv.amount),
        daysOverdue: inv.days_overdue,
        quickbooksInvoiceId: inv.quickbooks_invoice_id,
      };
    }
  }

  let result;
  try {
    result = await classifyReply({
      todayISO: todayISO(),
      clientReplyText: parsed.data.replyText,
      invoiceContext,
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Classification failed");
  }

  // Persist the classification.
  const insert = {
    user_id: ctx.user.id,
    invoice_id: invoiceId,
    thread_id: parsed.data.threadId ?? "(unknown)",
    message_id: parsed.data.messageId ?? null,
    client_email: parsed.data.clientEmail ?? null,
    classification: result.classification,
    promised_pay_date: result.promisedPayDate,
    raw_excerpt: result.excerpt,
    suggested_action: result.suggestedAction,
  };

  const { data: classificationRow } = await supabase
    .from("reply_classifications")
    .insert(insert)
    .select("id")
    .single();

  // If client promised a future pay date, schedule a follow-up reminder a few days after.
  let scheduledFor: string | null = null;
  if (
    result.classification === "will_pay_later" &&
    result.promisedPayDate &&
    invoiceId
  ) {
    const promised = new Date(result.promisedPayDate);
    if (!isNaN(promised.getTime())) {
      const followup = new Date(
        promised.getTime() + FOLLOWUP_BUFFER_DAYS * 86400000
      );
      scheduledFor = followup.toISOString().slice(0, 10);
      await supabase.from("reminder_schedules").insert({
        user_id: ctx.user.id,
        invoice_id: invoiceId,
        scheduled_for: scheduledFor,
        reason: `Client promised payment by ${result.promisedPayDate}`,
        source_classification_id: classificationRow?.id ?? null,
      });
    }
  }

  return NextResponse.json({
    classification: result.classification,
    promisedPayDate: result.promisedPayDate,
    excerpt: result.excerpt,
    suggestedAction: result.suggestedAction,
    scheduledFor,
    invoiceId,
  });
}

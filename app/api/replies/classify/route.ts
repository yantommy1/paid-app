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
  // When true, dedupe by thread_id and skip if a recent classification exists.
  // The Gmail Add-On sets this when auto-classifying on thread open so we
  // don't burn an LLM call per render.
  auto: z.boolean().optional(),
});

const FOLLOWUP_BUFFER_DAYS = 3;
const CANNOT_PAY_FOLLOWUP_DAYS = 7;
const PAYMENT_PLAN_FOLLOWUP_DAYS = 5;

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

  // Auto-dedupe: when the add-on auto-classifies on thread open, return any
  // existing recent classification instead of burning another LLM call.
  if (parsed.data.auto && parsed.data.threadId) {
    const { data: existing } = await supabase
      .from("reply_classifications")
      .select("id, classification, promised_pay_date, raw_excerpt, suggested_action, invoice_id, created_at")
      .eq("user_id", ctx.user.id)
      .eq("thread_id", parsed.data.threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { data: nextSched } = await supabase
        .from("reminder_schedules")
        .select("scheduled_for")
        .eq("user_id", ctx.user.id)
        .eq("invoice_id", existing.invoice_id ?? "")
        .is("cancelled_at", null)
        .is("fulfilled_at", null)
        .order("scheduled_for", { ascending: true })
        .limit(1)
        .maybeSingle();
      return NextResponse.json({
        classification: existing.classification,
        promisedPayDate: existing.promised_pay_date,
        excerpt: existing.raw_excerpt,
        suggestedAction: existing.suggested_action,
        scheduledFor: nextSched?.scheduled_for ?? null,
        invoiceId: existing.invoice_id,
        cached: true,
      });
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

  // Auto-schedule follow-ups based on the classification.
  let scheduledFor: string | null = null;
  let scheduleReason: string | null = null;
  if (invoiceId) {
    if (result.classification === "will_pay_later" && result.promisedPayDate) {
      const promised = new Date(result.promisedPayDate);
      if (!isNaN(promised.getTime())) {
        const followup = new Date(promised.getTime() + FOLLOWUP_BUFFER_DAYS * 86400000);
        scheduledFor = followup.toISOString().slice(0, 10);
        scheduleReason = `Client promised payment by ${result.promisedPayDate}; follow up if not received.`;
      }
    } else if (result.classification === "cannot_pay") {
      const followup = new Date(Date.now() + CANNOT_PAY_FOLLOWUP_DAYS * 86400000);
      scheduledFor = followup.toISOString().slice(0, 10);
      scheduleReason =
        "Client said they cannot pay. Follow up with a payment plan offer.";
    } else if (result.classification === "payment_plan_request") {
      const followup = new Date(Date.now() + PAYMENT_PLAN_FOLLOWUP_DAYS * 86400000);
      scheduledFor = followup.toISOString().slice(0, 10);
      scheduleReason =
        "Client requested a payment plan. Follow up if no agreement reached.";
    } else if (result.classification === "invoice_issue") {
      // Don't auto-schedule — flag for the owner to handle manually first.
      scheduleReason = null;
    }

    if (scheduledFor && scheduleReason) {
      await supabase.from("reminder_schedules").insert({
        user_id: ctx.user.id,
        invoice_id: invoiceId,
        scheduled_for: scheduledFor,
        reason: scheduleReason,
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

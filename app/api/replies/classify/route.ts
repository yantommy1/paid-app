import { classifyReply } from "@/lib/anthropic/classify-reply";
import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { logError, logInfo } from "@/lib/observability/log";
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
  if (!parsed.success) {
    logError({
      route: "replies.classify",
      event: "invalid_payload",
      userId: ctx.user.id,
      err: parsed.error.message,
    });
    return serverError("Invalid payload", 400);
  }

  // Log entry so we can confirm whether the contextual auto-classify is
  // hitting the server at all. Tommy reported zero classification rows
  // after multiple reply cycles — if these logs never appear, the
  // Apps Script handler isn't calling us. If they appear but the insert
  // log below doesn't, the insert is being short-circuited.
  logInfo({
    route: "replies.classify",
    event: "called",
    userId: ctx.user.id,
    auto: !!parsed.data.auto,
    hasInvoiceId: !!parsed.data.invoiceId,
    hasClientEmail: !!parsed.data.clientEmail,
    replyTextLength: parsed.data.replyText.length,
  });

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
  // Normalize aggressively — trim + lowercase. QB stores client_email lowercased
  // post-sync, but inbound From: headers can carry oddball whitespace or
  // mixed case. Use ilike against the normalized form so case differences
  // never cause a miss.
  const normalizedEmail = parsed.data.clientEmail
    ? parsed.data.clientEmail.trim().toLowerCase()
    : null;
  if (!invoiceId && normalizedEmail) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, amount, days_overdue, quickbooks_invoice_id")
      .eq("user_id", ctx.user.id)
      .ilike("client_email", normalizedEmail)
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

  // Backfill orphans for this client whenever we know which invoice they
  // belong to. If a prior /api/replies/classify call ran before the QB sync
  // completed (or before BillEmail was populated), those rows are orphan
  // with invoice_id=null. Now that we have a match, re-link them so the
  // History card surfaces them. Idempotent after the first run.
  if (invoiceId && normalizedEmail) {
    await supabase
      .from("reply_classifications")
      .update({ invoice_id: invoiceId })
      .eq("user_id", ctx.user.id)
      .is("invoice_id", null)
      .ilike("client_email", normalizedEmail);
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
    // Surface the underlying LLM/network reason instead of a generic 500 so
    // the add-on can show "Anthropic rate-limited" / "API key missing" / etc.
    logError({
      route: "replies.classify",
      event: "classify_call_failed",
      userId: ctx.user.id,
      err: e,
    });
    const detail = e instanceof Error ? e.message : "Classification failed";
    return NextResponse.json(
      { error: "Classification failed", detail },
      { status: 502 }
    );
  }

  // Persist the classification. Store the normalized email so future
  // backfills can find this row via ilike on the same normalized form.
  const insert = {
    user_id: ctx.user.id,
    invoice_id: invoiceId,
    thread_id: parsed.data.threadId ?? "(unknown)",
    message_id: parsed.data.messageId ?? null,
    client_email: normalizedEmail,
    classification: result.classification,
    promised_pay_date: result.promisedPayDate,
    raw_excerpt: result.excerpt,
    suggested_action: result.suggestedAction,
  };

  const { data: classificationRow, error: insertErr } = await supabase
    .from("reply_classifications")
    .insert(insert)
    .select("id")
    .single();

  if (insertErr) {
    logError({
      route: "replies.classify",
      event: "insert_failed",
      userId: ctx.user.id,
      err: insertErr.message,
      insert,
    });
    return NextResponse.json(
      { error: "Could not save classification", detail: insertErr.message },
      { status: 500 }
    );
  }

  logInfo({
    route: "replies.classify",
    event: "inserted",
    userId: ctx.user.id,
    classificationId: classificationRow?.id,
    invoiceId,
    classification: result.classification,
  });

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
      // Supersede any prior un-fulfilled schedules for this invoice. When a
      // client's plan changes — "cannot pay" then "will pay Jun 24" then
      // "will pay Aug 23" — only the most recent plan is real. Without
      // this, the Planned section accretes three stale rows for the same
      // negotiation. We cancel rather than delete so the audit trail is
      // preserved (cron and analytics queries can still see what was
      // planned at any past point in time).
      await supabase
        .from("reminder_schedules")
        .update({
          cancelled_at: new Date().toISOString(),
          // Stamp the reason for cancellation so the audit row is self-
          // explanatory: "this was superseded by a newer classification."
          reason: "Superseded by newer classification.",
        })
        .eq("user_id", ctx.user.id)
        .eq("invoice_id", invoiceId)
        .is("cancelled_at", null)
        .is("fulfilled_at", null);

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

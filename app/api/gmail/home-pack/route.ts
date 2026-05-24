import { featuresFor, planFromRow } from "@/lib/billing/plan";
import { computeCohorts, computeSidebarHeader } from "@/lib/invoices/sidebar-stats";
import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Single round-trip for the Gmail Add-On home card.
 *
 * Returns invoices/cohorts/header (gmail-sidebar shape) + a recent-activity
 * feed in one response so the add-on does not need multiple sequential
 * network calls when the sidebar opens.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);

  // Run all four queries in parallel so we don't serialise DB round-trips.
  // The user-subscription query joins onto the same /api/me/plan logic but
  // shaves a round-trip off the add-on's cold open. Returned alongside
  // invoices/cohorts so the add-on knows the plan on every render without
  // a separate /api/me/plan fetch.
  const [invoiceQuery, replyQuery, reminderQuery, userSubQuery] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("user_id", ctx.user.id)
      .neq("status", "paid")
      .order("days_overdue", { ascending: false }),
    supabase
      .from("reply_classifications")
      .select(
        "id, invoice_id, classification, promised_pay_date, raw_excerpt, suggested_action, created_at, client_email, thread_id"
      )
      .eq("user_id", ctx.user.id)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("reminder_logs")
      .select("id, invoice_id, channel, subject, sent_to, tone, pay_link_included, discount_pct, created_at")
      .eq("user_id", ctx.user.id)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("users")
      .select("stripe_price_id, subscription_status, trial_ends_at, subscription_ends_at")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  ]);

  if (invoiceQuery.error) {
    return serverError(invoiceQuery.error.message);
  }

  const invoices = invoiceQuery.data ?? [];
  const cohorts = computeCohorts(invoices);
  const header = computeSidebarHeader(invoices);

  const replies = replyQuery.error ? [] : replyQuery.data ?? [];
  const invoicesById: Record<
    string,
    {
      client_name: string;
      client_email: string;
      amount: number;
      days_overdue: number;
      quickbooks_invoice_id: string;
      status: string;
    }
  > = Object.fromEntries(
    invoices.map((i) => [
      i.id,
      {
        client_name: i.client_name,
        client_email: i.client_email,
        amount: Number(i.amount),
        days_overdue: i.days_overdue,
        quickbooks_invoice_id: i.quickbooks_invoice_id,
        status: i.status,
      },
    ])
  );

  // Pending follow-ups for those reply invoices
  const replyInvoiceIds = Array.from(
    new Set(replies.map((r) => r.invoice_id).filter((v): v is string => Boolean(v)))
  );
  let nextFollowupByInvoice: Record<string, string> = {};
  if (replyInvoiceIds.length > 0) {
    const { data: schedules } = await supabase
      .from("reminder_schedules")
      .select("invoice_id, scheduled_for")
      .eq("user_id", ctx.user.id)
      .in("invoice_id", replyInvoiceIds)
      .is("cancelled_at", null)
      .is("fulfilled_at", null)
      .order("scheduled_for", { ascending: true });
    for (const s of schedules ?? []) {
      const id = (s as { invoice_id: string }).invoice_id;
      if (id && !nextFollowupByInvoice[id]) {
        nextFollowupByInvoice[id] = (s as { scheduled_for: string }).scheduled_for;
      }
    }
  }

  const activity = replies.map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    classification: r.classification,
    promisedPayDate: r.promised_pay_date,
    excerpt: r.raw_excerpt,
    suggestedAction: r.suggested_action,
    createdAt: r.created_at,
    clientEmail: r.client_email,
    threadId: r.thread_id,
    invoice: r.invoice_id ? invoicesById[r.invoice_id] ?? null : null,
    nextFollowup: r.invoice_id ? nextFollowupByInvoice[r.invoice_id] ?? null : null,
  }));

  // Recent reminders sent — surface a global timeline in the sidebar so the
  // user sees outgoing activity at a glance, not just inbound replies.
  const reminders = reminderQuery.error ? [] : reminderQuery.data ?? [];
  const recentReminders = reminders.map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    channel: r.channel,
    subject: r.subject,
    sentTo: r.sent_to,
    tone: r.tone,
    payLinkIncluded: r.pay_link_included,
    discountPct: r.discount_pct,
    createdAt: r.created_at,
    invoice: r.invoice_id ? invoicesById[r.invoice_id] ?? null : null,
  }));

  const plan = planFromRow(
    userSubQuery.data as {
      stripe_price_id?: string | null;
      subscription_status?: string | null;
      trial_ends_at?: string | null;
      subscription_ends_at?: string | null;
    } | null
  );

  return NextResponse.json(
    {
      cohorts,
      header,
      invoices,
      activity,
      recentReminders,
      user_email: ctx.user.email ?? "",
      // v1.7.0: plan + feature flags on the home-pack so the add-on can
      // gate UI per render without a separate /api/me/plan round-trip.
      plan,
      features: featuresFor(plan),
    },
    {
      headers: {
        // Tell intermediate caches & the add-on this is short-cacheable.
        "Cache-Control": "private, max-age=30",
      },
    }
  );
}

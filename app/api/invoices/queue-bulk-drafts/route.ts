import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the review queue from cached pre-warmed drafts (no LLM calls here).
 *
 * Previous behavior: build drafts on demand for every overdue invoice. With
 * many invoices that timed out at Vercel's 10s function limit. The new
 * implementation reads only what's already cached on the invoice row and
 * lets the daily cron / single-invoice draft endpoint do the LLM work.
 *
 * Invoices without a fresh cache appear in `staleInvoiceIds` so the add-on
 * can opportunistically refresh them one at a time.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, client_name, client_email, amount, days_overdue, draft_all_tones, draft_all_tones_at, draft_auto_tone"
    )
    .eq("user_id", ctx.user.id)
    .gte("days_overdue", 30)
    .neq("status", "paid")
    .neq("status", "reminder_sent");

  if (error) {
    return serverError(error.message);
  }

  const queue: Array<{
    invoiceId: string;
    clientName: string;
    clientEmail: string;
    amount: number;
    daysOverdue: number;
    subject: string;
    body: string;
    tone: string;
    payNowIncluded: boolean;
  }> = [];
  const staleInvoiceIds: string[] = [];

  for (const inv of invoices ?? []) {
    const fresh =
      inv.draft_all_tones &&
      inv.draft_all_tones_at &&
      Date.now() - new Date(inv.draft_all_tones_at).getTime() < CACHE_FRESHNESS_MS;
    if (!fresh) {
      staleInvoiceIds.push(inv.id);
      continue;
    }
    const tones = inv.draft_all_tones as Record<
      string,
      { subject?: string; body?: string; payNowIncluded?: boolean } | undefined
    >;
    const tone = (inv.draft_auto_tone as string | null) ?? "professional";
    const picked = tones[tone] ?? tones.professional ?? tones.friendly ?? tones.firm;
    if (!picked || !picked.subject) continue;
    queue.push({
      invoiceId: inv.id,
      clientName: inv.client_name,
      clientEmail: inv.client_email,
      amount: Number(inv.amount),
      daysOverdue: inv.days_overdue,
      subject: picked.subject ?? "",
      body: picked.body ?? "",
      tone,
      payNowIncluded: !!picked.payNowIncluded,
    });
  }

  return NextResponse.json({ queue, staleInvoiceIds });
}

import { feePercentFromSettings } from "@/lib/fees/contingency";
import { pushPaymentToQuickBooks } from "@/lib/quickbooks/push-payment";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Marks an invoice paid and records contingency fee (60+/90+ tiers) from settings.
 * Also pushes a Payment record to QuickBooks (idempotent — see push-payment.ts).
 * Idempotent if the invoice is already paid.
 */
export async function markInvoicePaidWithFees(
  supabase: SupabaseClient,
  params: {
    userId: string;
    invoiceId: string;
    paymentMethod?: "stripe" | "manual" | "ach" | "check" | "other";
  }
): Promise<{
  ok: boolean;
  feePercentage: number;
  feeAmount: number;
  skipped?: "already_paid";
  quickbooksPushed?: boolean;
  quickbooksError?: string;
}> {
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", params.invoiceId)
    .eq("user_id", params.userId)
    .single();

  if (invErr || !inv) {
    throw new Error("Invoice not found");
  }

  if (inv.status === "paid") {
    return { ok: true, feePercentage: 0, feeAmount: 0, skipped: "already_paid" };
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("fee_60_day, fee_90_day")
    .eq("user_id", params.userId)
    .single();

  const pct = feePercentFromSettings(inv.days_overdue, settings);
  const amt =
    Math.round((Number(inv.amount) * pct) / 100 * 100) / 100;

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      recovered_at: inv.days_overdue >= 60 ? now : inv.recovered_at,
    })
    .eq("id", inv.id);

  if (upErr) {
    throw new Error(upErr.message);
  }

  if (pct > 0 && amt > 0) {
    const { data: existing } = await supabase
      .from("fees")
      .select("id")
      .eq("invoice_id", inv.id)
      .limit(1);

    if (!existing?.length) {
      const { error: feeErr } = await supabase.from("fees").insert({
        user_id: params.userId,
        invoice_id: inv.id,
        fee_percentage: pct,
        fee_amount: amt,
        collected_at: now,
      });
      if (feeErr) {
        throw new Error(feeErr.message);
      }
    }
  }

  // Push the payment to QuickBooks so the invoice closes there too.
  // Failure does NOT roll back the local update — the cron / next webhook can retry.
  let quickbooksPushed = false;
  let quickbooksError: string | undefined;
  try {
    const pushResult = await pushPaymentToQuickBooks(supabase, {
      userId: params.userId,
      invoiceId: inv.id,
      amountUsd: Number(inv.amount),
      paymentMethod: params.paymentMethod ?? "stripe",
      paidAt: now,
    });
    if (pushResult.ok && "paymentId" in pushResult && pushResult.paymentId) {
      quickbooksPushed = true;
    } else if (!pushResult.ok) {
      quickbooksError = pushResult.error;
    }
  } catch (e) {
    quickbooksError = e instanceof Error ? e.message : "QB push failed";
  }

  return { ok: true, feePercentage: pct, feeAmount: amt, quickbooksPushed, quickbooksError };
}

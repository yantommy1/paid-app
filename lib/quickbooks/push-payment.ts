import { getQuickBooksCompanyApiBase } from "@/lib/quickbooks/api-base";
import { ensureQuickBooksToken } from "@/lib/oauth/tokens";
import type { QuickBooksToken } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type QbPushPaymentResult =
  | { ok: true; paymentId: string; pushedAt: string; skipped?: undefined }
  | { ok: true; skipped: "already_pushed" | "auto_record_disabled" | "no_qb_token" | "missing_customer" }
  | { ok: false; error: string };

/**
 * Create a Payment in QuickBooks linked to the given invoice. Marks the
 * invoice paid in QB and updates our local record with the QB Payment ID.
 *
 * Idempotent: if `quickbooks_payment_id` is already set on the invoice we
 * skip the push. Safe to call from Stripe webhooks (which retry) and from
 * the manual mark-paid flow.
 */
export async function pushPaymentToQuickBooks(
  supabase: SupabaseClient,
  params: {
    userId: string;
    invoiceId: string;
    amountUsd: number;
    paymentMethod?: "stripe" | "manual" | "ach" | "check" | "other";
    paidAt?: string;
  }
): Promise<QbPushPaymentResult> {
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, quickbooks_invoice_id, quickbooks_customer_id, quickbooks_payment_id, amount, user_id"
    )
    .eq("id", params.invoiceId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!inv) return { ok: false, error: "Invoice not found" };
  if (inv.quickbooks_payment_id) {
    return { ok: true, skipped: "already_pushed" };
  }
  if (!inv.quickbooks_customer_id) {
    return { ok: true, skipped: "missing_customer" };
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("quickbooks_auto_record_payments")
    .eq("user_id", params.userId)
    .maybeSingle();
  if (settings && settings.quickbooks_auto_record_payments === false) {
    return { ok: true, skipped: "auto_record_disabled" };
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("quickbooks_token")
    .eq("id", params.userId)
    .maybeSingle();
  const rawToken = userRow?.quickbooks_token as unknown as QuickBooksToken | null;
  const fresh = await ensureQuickBooksToken(rawToken);
  if (!fresh) return { ok: true, skipped: "no_qb_token" };

  // Persist refreshed token if it changed
  if (rawToken && fresh.access_token !== rawToken.access_token) {
    await supabase
      .from("users")
      .update({ quickbooks_token: fresh as unknown as Record<string, unknown> })
      .eq("id", params.userId);
  }

  const base = getQuickBooksCompanyApiBase();
  const url = `${base}/${fresh.realm_id}/payment?minorversion=65`;
  const totalAmt = Math.round(Number(params.amountUsd) * 100) / 100;

  const body = {
    TotalAmt: totalAmt,
    CustomerRef: { value: inv.quickbooks_customer_id },
    PrivateNote:
      params.paymentMethod === "stripe"
        ? `Recorded via Paid (Stripe) ${params.paidAt ?? new Date().toISOString()}`
        : `Recorded via Paid (${params.paymentMethod ?? "other"}) ${params.paidAt ?? new Date().toISOString()}`,
    Line: [
      {
        Amount: totalAmt,
        LinkedTxn: [
          {
            TxnId: inv.quickbooks_invoice_id,
            TxnType: "Invoice",
          },
        ],
      },
    ],
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fresh.access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "QB request failed" };
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[push-payment] QB Payment create failed", resp.status, text);
    return { ok: false, error: `QB Payment create failed: ${resp.status}` };
  }

  let parsed: { Payment?: { Id?: string } } | null = null;
  try {
    parsed = (await resp.json()) as { Payment?: { Id?: string } };
  } catch {
    return { ok: false, error: "Could not parse QB response" };
  }
  const paymentId = parsed?.Payment?.Id;
  if (!paymentId) {
    return { ok: false, error: "QB Payment response missing Id" };
  }

  const now = params.paidAt ?? new Date().toISOString();
  await supabase
    .from("invoices")
    .update({
      quickbooks_payment_id: paymentId,
      quickbooks_payment_pushed_at: now,
    })
    .eq("id", params.invoiceId);

  return { ok: true, paymentId, pushedAt: now };
}

import { feeAmountFromSettings } from "@/lib/fees/contingency";
import { createDestinationCheckout } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public Pay Now redirect.
 *
 * Anyone with the link can pay (this is intentional — the link is shared with the client).
 * On click we look up the invoice, validate it is payable, and create a Stripe Checkout
 * session on the merchant's connected account with the correct amount (after any early-pay
 * discount that is still within the discount window).
 *
 * Query params:
 *   d  = discount percent (e.g. "2.0") — only honored if the link is clicked within `dd` days
 *   dd = discount window in days from the time the reminder was sent (defaults to 7)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;
  const url = new URL(request.url);
  const discountParam = url.searchParams.get("d");
  const discountWindowParam = url.searchParams.get("dd");
  const requestedDiscountPct = discountParam ? Number(discountParam) : 0;
  const discountWindowDays = discountWindowParam ? Number(discountWindowParam) : 7;

  const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://paid-app.com";

  const admin = createAdminClient();

  const { data: inv } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!inv) {
    return NextResponse.redirect(`${appBase}/pay/not-found`, { status: 302 });
  }
  if (inv.status === "paid") {
    return NextResponse.redirect(`${appBase}/pay/already-paid`, { status: 302 });
  }

  const { data: userRow } = await admin
    .from("users")
    .select("stripe_connect_account_id")
    .eq("id", inv.user_id)
    .maybeSingle();

  if (!userRow?.stripe_connect_account_id) {
    return NextResponse.redirect(`${appBase}/pay/not-configured`, { status: 302 });
  }

  // Discount only applies if reminder was sent within the discount window.
  let appliedDiscountPct = 0;
  if (
    requestedDiscountPct > 0 &&
    requestedDiscountPct <= 50 &&
    inv.reminder_sent_at
  ) {
    const sentAt = new Date(inv.reminder_sent_at).getTime();
    const cutoff = sentAt + discountWindowDays * 86400000;
    if (Date.now() <= cutoff) {
      appliedDiscountPct = requestedDiscountPct;
    }
  }

  const baseAmount = Number(inv.amount);
  const chargeAmount =
    appliedDiscountPct > 0
      ? Math.round(baseAmount * (100 - appliedDiscountPct)) / 100
      : baseAmount;
  const amountCents = Math.round(chargeAmount * 100);

  const { data: settings } = await admin
    .from("settings")
    .select("fee_60_day, fee_90_day")
    .eq("user_id", inv.user_id)
    .maybeSingle();

  // Contingency fee is only owed at 60+ day tiers; for 30-day collections the fee is 0.
  const feeDollars = feeAmountFromSettings(
    { amount: chargeAmount, days_overdue: inv.days_overdue },
    settings
  );
  const applicationFeeCents = Math.round(feeDollars * 100);

  try {
    const { url: checkoutUrl } = await createDestinationCheckout({
      connectedAccountId: userRow.stripe_connect_account_id,
      amountCents,
      applicationFeeCents,
      successUrl: `${appBase}/pay/thanks?invoice=${inv.id}`,
      cancelUrl: `${appBase}/pay/canceled?invoice=${inv.id}`,
      metadata: {
        paid_invoice_id: inv.id,
        supabase_user_id: inv.user_id,
        applied_discount_pct: String(appliedDiscountPct),
      },
    });

    if (!checkoutUrl) {
      return NextResponse.redirect(`${appBase}/pay/error`, { status: 302 });
    }
    return NextResponse.redirect(checkoutUrl, { status: 302 });
  } catch (e) {
    console.error("[/pay/:invoiceId] checkout failed", e);
    return NextResponse.redirect(`${appBase}/pay/error`, { status: 302 });
  }
}

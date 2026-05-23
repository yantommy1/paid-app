import { feeAmountFromSettings } from "@/lib/fees/contingency";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createDestinationCheckout } from "@/lib/stripe/connect";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
});

/**
 * Hosted Checkout on the connected account with application_fee_amount (Paid’s contingency).
 * Client pays invoice amount; Stripe splits the fee to the platform account.
 */
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
    return serverError("Invalid payload", 400);
  }

  const supabase = await createRouteHandlerClient(request);

  const { data: userRow, error: uErr } = await supabase
    .from("users")
    .select("stripe_connect_account_id")
    .eq("id", ctx.user.id)
    .single();

  if (uErr || !userRow?.stripe_connect_account_id) {
    return serverError("Connect Stripe first via /api/stripe/connect", 400);
  }

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.user.id)
    .single();

  if (invErr || !inv || inv.status === "paid") {
    return notFound("Invoice not found or already paid");
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("fee_60_day, fee_90_day")
    .eq("user_id", ctx.user.id)
    .single();

  const amountCents = Math.round(Number(inv.amount) * 100);
  const feeDollars = feeAmountFromSettings(inv, settings);
  const applicationFeeCents = Math.round(feeDollars * 100);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const successUrl = `${appUrl}/onboarding?step=stripe-paid&invoice=${inv.id}`;
  const cancelUrl = `${appUrl}/onboarding`;

  try {
    const { url } = await createDestinationCheckout({
      connectedAccountId: userRow.stripe_connect_account_id,
      amountCents,
      applicationFeeCents,
      successUrl,
      cancelUrl,
      metadata: {
        paid_invoice_id: inv.id,
        supabase_user_id: ctx.user.id,
      },
    });

    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return serverError(message);
  }
}

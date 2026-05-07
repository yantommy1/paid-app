import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createConnectOnboarding, getStripe } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe Connect status for the current user.
 *
 * Returns whether the merchant has a Connect account and whether onboarding
 * is complete. If not complete, also returns a fresh onboarding URL so the
 * caller (the Settings page or the Gmail Add-On) can drop the merchant
 * straight into Stripe's setup flow without a separate POST round-trip.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: userRow } = await supabase
    .from("users")
    .select("stripe_connect_account_id")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const accountId = userRow?.stripe_connect_account_id ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://paid-app.com";
  const returnUrl = `${appUrl}/onboarding?step=stripe-done`;

  // No account yet — generate one and return its onboarding URL.
  if (!accountId) {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingUrl: null,
        error: "Stripe is not configured.",
      });
    }
    try {
      const { url, accountId: newId } = await createConnectOnboarding(
        ctx.user.id,
        ctx.user.email ?? "",
        returnUrl
      );
      const admin = createAdminClient();
      await admin
        .from("users")
        .update({ stripe_connect_account_id: newId })
        .eq("id", ctx.user.id);
      return NextResponse.json({
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingUrl: url,
        accountId: newId,
      });
    } catch (e) {
      return serverError(e instanceof Error ? e.message : "Stripe Connect init failed");
    }
  }

  // Account exists — check whether onboarding is complete.
  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const fullyConnected = chargesEnabled && payoutsEnabled;

    let onboardingUrl: string | null = null;
    if (!fullyConnected) {
      try {
        const link = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: returnUrl,
          return_url: returnUrl,
          type: "account_onboarding",
        });
        onboardingUrl = link.url;
      } catch {
        onboardingUrl = null;
      }
    }

    return NextResponse.json({
      connected: fullyConnected,
      chargesEnabled,
      payoutsEnabled,
      onboardingUrl,
      accountId,
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Stripe Connect status failed");
  }
}

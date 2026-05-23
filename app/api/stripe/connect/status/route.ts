import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { logError, logInfo } from "@/lib/observability/log";
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
 *
 * Failure modes are returned as 200 with a `code` discriminator instead of
 * 500 — the add-on shows a useful card per code (no Stripe key configured,
 * account was deleted on Stripe side, etc.). Real bugs still throw 500 via
 * the outer try/catch.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://paid-app.com";
  const returnUrl = `${appUrl}/onboarding?step=stripe-done`;

  if (!process.env.STRIPE_SECRET_KEY) {
    // Surface as a 200 so the add-on can branch on `code` rather than
    // throwing a generic 500 the user can't act on.
    return NextResponse.json({
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardingUrl: null,
      code: "STRIPE_NOT_CONFIGURED",
      error:
        "Stripe is not configured on the Paid server. Contact support@paid-app.com.",
    });
  }

  let supabase;
  try {
    supabase = await createRouteHandlerClient(request);
  } catch (e) {
    logError({
      route: "stripe.connect.status",
      event: "supabase_client.failed",
      userId: ctx.user.id,
      err: e,
    });
    return NextResponse.json(
      { code: "SERVER_ERROR", error: "Could not reach the database." },
      { status: 500 }
    );
  }

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("stripe_connect_account_id")
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (userErr) {
    logError({
      route: "stripe.connect.status",
      event: "users_select.failed",
      userId: ctx.user.id,
      err: userErr,
    });
    return NextResponse.json(
      { code: "SERVER_ERROR", error: "User lookup failed." },
      { status: 500 }
    );
  }

  const accountId = userRow?.stripe_connect_account_id ?? null;

  // No account yet — generate one and return its onboarding URL.
  if (!accountId) {
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
      logInfo({
        route: "stripe.connect.status",
        event: "account.created",
        userId: ctx.user.id,
      });
      return NextResponse.json({
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingUrl: url,
        accountId: newId,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Stripe Connect init failed";
      logError({
        route: "stripe.connect.status",
        event: "account.create_failed",
        userId: ctx.user.id,
        err: e,
      });
      return NextResponse.json(
        {
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingUrl: null,
          code: "STRIPE_INIT_FAILED",
          error: message,
        },
        { status: 200 }
      );
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
      } catch (linkErr) {
        logError({
          route: "stripe.connect.status",
          event: "account_link.create_failed",
          userId: ctx.user.id,
          accountId,
          err: linkErr,
        });
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
    const message = e instanceof Error ? e.message : "";
    // Stale account id in our DB → the Stripe account was deleted or moved.
    // Clear the column and create a fresh account so the user can recover
    // without a manual reset. This was a P0 for "Stripe Connect doesn't
    // work" — every retry hit the dead account id and returned 500.
    const isStale =
      /No such account|resource_missing|does not exist|account_invalid/i.test(message);
    if (isStale) {
      logInfo({
        route: "stripe.connect.status",
        event: "stale_account.recover",
        userId: ctx.user.id,
        accountId,
      });
      try {
        const admin = createAdminClient();
        await admin
          .from("users")
          .update({ stripe_connect_account_id: null })
          .eq("id", ctx.user.id);
        const { url, accountId: newId } = await createConnectOnboarding(
          ctx.user.id,
          ctx.user.email ?? "",
          returnUrl
        );
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
          code: "STALE_ACCOUNT_RECREATED",
        });
      } catch (recoverErr) {
        logError({
          route: "stripe.connect.status",
          event: "stale_account.recover_failed",
          userId: ctx.user.id,
          err: recoverErr,
        });
      }
    }
    logError({
      route: "stripe.connect.status",
      event: "account.retrieve_failed",
      userId: ctx.user.id,
      accountId,
      err: e,
    });
    return NextResponse.json(
      { code: "STRIPE_STATUS_FAILED", error: message || "Stripe status check failed." },
      { status: 500 }
    );
  }
}

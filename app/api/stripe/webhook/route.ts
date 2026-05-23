import { markInvoicePaidWithFees } from "@/lib/fees/mark-invoice-paid";
import { serverError } from "@/lib/api/errors";
import { logError, logInfo } from "@/lib/observability/log";
import { getStripe } from "@/lib/stripe/connect";
import {
  markSubscriptionCanceled,
  updateUserSubscriptionByCustomerId,
  updateUserSubscriptionFromStripe,
} from "@/lib/stripe/sync-user-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

async function ensureUserForCheckoutEmail(
  email: string,
  firstName?: string,
  lastName?: string
) {
  const admin = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existingUserRow } = await admin
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingUserRow?.id) {
    return String(existingUserRow.id);
  }

  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");

  const created = await admin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: fullName
      ? {
          name: fullName,
          full_name: fullName,
        }
      : undefined,
  });
  if (created.error || !created.data.user) {
    throw new Error("Could not create account.");
  }

  await admin.from("users").upsert(
    {
      id: created.data.user.id,
      email: normalizedEmail,
      onboarding_completed: false,
      name: fullName || null,
    },
    { onConflict: "id" }
  );

  return created.data.user.id;
}

async function sendMagicLinkToUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://paid-app.com";
  const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback`;
  const admin = createAdminClient();

  await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
    options: { redirectTo },
  });

  const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonUrl || !anonKey) return;

  const publicClient = createSupabaseClient(anonUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await publicClient.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY) {
    return serverError("Stripe is not configured.", 500);
  }

  if (!sig || !secret) {
    return serverError("Missing webhook signature.", 400);
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid payload";
    return serverError(message, 400);
  }

  const admin = createAdminClient();
  const stripe = getStripe();

  // Stripe retries on any 5xx and may also redeliver on transient network
  // blips. Without idempotency a redelivered `payment_intent.succeeded`
  // could double-record a payment or double-charge platform fees. We use
  // `processed_stripe_events` as a write-once log keyed by event.id —
  // duplicates short-circuit before any side effects run.
  const { data: alreadyProcessed } = await admin
    .from("processed_stripe_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (alreadyProcessed) {
    logInfo({
      route: "stripe.webhook",
      event: "duplicate_event.skipped",
      stripeEventId: event.id,
      stripeEventType: event.type,
    });
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const purpose = session.metadata?.checkout_purpose;
      const checkoutEmail = (
        session.customer_details?.email ??
        session.customer_email ??
        session.metadata?.checkout_email ??
        ""
      )
        .trim()
        .toLowerCase();
      const checkoutName = (session.metadata?.checkout_name ?? "").trim();
      const checkoutFullName = (session.metadata?.checkout_full_name ?? "").trim();
      const checkoutFirstName = (session.metadata?.checkout_first_name ?? "").trim();
      const checkoutLastName = (session.metadata?.checkout_last_name ?? "").trim();

      if (session.mode === "subscription" && purpose === "saas_subscription" && checkoutEmail) {
        const subRef = session.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        const custRef = session.customer;
        const customerId =
          typeof custRef === "string" ? custRef : custRef?.id ?? null;
        if (subId && customerId) {
          try {
            const userId = await ensureUserForCheckoutEmail(
              checkoutEmail,
              checkoutFirstName || checkoutFullName || checkoutName || undefined,
              checkoutLastName || undefined
            );
            const subscription = await stripe.subscriptions.retrieve(subId, {
              expand: ["items.data.price"],
            });
            await updateUserSubscriptionFromStripe(
              userId,
              subscription,
              customerId
            );
            const trialEndSec = subscription.trial_end;
            const trialEndsAt =
              trialEndSec != null
                ? new Date(trialEndSec * 1000).toISOString()
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            const { error: trialUpdateErr } = await admin
              .from("users")
              .update({
                stripe_customer_id: customerId,
                stripe_subscription_id: subId,
                subscription_status: "trialing",
                trial_ends_at: trialEndsAt,
              })
              .eq("id", userId);
            if (trialUpdateErr) {
              throw new Error(trialUpdateErr.message);
            }
            await sendMagicLinkToUser(checkoutEmail);
            logInfo({
              route: "stripe.webhook",
              event: "saas_subscription.activated",
              stripeEventId: event.id,
              userId,
            });
          } catch (err) {
            logError({
              route: "stripe.webhook",
              event: "saas_subscription.activate_failed",
              stripeEventId: event.id,
              checkoutEmail,
              subId,
              customerId,
              err,
            });
            // 500 → Stripe retries (up to 3 days, exponential backoff).
            return serverError("Subscription activation failed; will retry.", 500);
          }
        }
        break;
      }

      const invoiceId = session.metadata?.paid_invoice_id;
      const invoiceUserId = session.metadata?.supabase_user_id;
      if (invoiceId && invoiceUserId) {
        try {
          await markInvoicePaidWithFees(admin, {
            userId: invoiceUserId,
            invoiceId,
            paymentMethod: "stripe",
          });
          logInfo({
            route: "stripe.webhook",
            event: "checkout.invoice_paid",
            stripeEventId: event.id,
            userId: invoiceUserId,
            invoiceId,
          });
        } catch (err) {
          logError({
            route: "stripe.webhook",
            event: "checkout.invoice_paid_failed",
            stripeEventId: event.id,
            userId: invoiceUserId,
            invoiceId,
            err,
          });
          return serverError("Invoice mark-paid failed; will retry.", 500);
        }
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      try {
        await updateUserSubscriptionByCustomerId(customerId, subscription);
      } catch (err) {
        logError({
          route: "stripe.webhook",
          event: "subscription.updated_failed",
          stripeEventId: event.id,
          customerId,
          err,
        });
        return serverError("Subscription sync failed; will retry.", 500);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      try {
        await markSubscriptionCanceled(subscription.id);
      } catch (err) {
        logError({
          route: "stripe.webhook",
          event: "subscription.deleted_failed",
          stripeEventId: event.id,
          subscriptionId: subscription.id,
          err,
        });
        return serverError("Subscription cancel sync failed; will retry.", 500);
      }
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.paid_invoice_id;
      const userId = pi.metadata?.supabase_user_id;
      if (invoiceId && userId) {
        try {
          await markInvoicePaidWithFees(admin, {
            userId,
            invoiceId,
          });
          logInfo({
            route: "stripe.webhook",
            event: "payment_intent.invoice_paid",
            stripeEventId: event.id,
            userId,
            invoiceId,
          });
        } catch (err) {
          logError({
            route: "stripe.webhook",
            event: "payment_intent.invoice_paid_failed",
            stripeEventId: event.id,
            userId,
            invoiceId,
            err,
          });
          return serverError("Invoice mark-paid failed; will retry.", 500);
        }
      }
      break;
    }
    default:
      break;
  }

  // Mark the event processed only after the switch completed without
  // throwing — if a handler returned 500 (we want Stripe to retry) we
  // never reach here, so the event stays unmarked. Conflict on the
  // primary key is fine (e.g. two concurrent deliveries of the same id).
  const { error: markErr } = await admin
    .from("processed_stripe_events")
    .upsert(
      { event_id: event.id, event_type: event.type },
      { onConflict: "event_id", ignoreDuplicates: true }
    );
  if (markErr) {
    logError({
      route: "stripe.webhook",
      event: "idempotency_mark.failed",
      stripeEventId: event.id,
      stripeEventType: event.type,
      err: markErr,
    });
    // Don't fail the webhook — Stripe got a successful handler. Worst case
    // a redelivery re-runs an idempotent handler.
  }

  return NextResponse.json({ received: true });
}

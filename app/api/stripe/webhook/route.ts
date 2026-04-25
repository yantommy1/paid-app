import { markInvoicePaidWithFees } from "@/lib/fees/mark-invoice-paid";
import { serverError } from "@/lib/api/errors";
import { getStripe } from "@/lib/stripe/connect";
import {
  markSubscriptionCanceled,
  updateUserSubscriptionByCustomerId,
  updateUserSubscriptionFromStripe,
} from "@/lib/stripe/sync-user-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return serverError("Missing signature", 400);
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const purpose = session.metadata?.checkout_purpose;
      const userId = session.metadata?.supabase_user_id;

      if (session.mode === "subscription" && purpose === "saas_subscription" && userId) {
        const subRef = session.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        const custRef = session.customer;
        const customerId =
          typeof custRef === "string" ? custRef : custRef?.id ?? null;
        if (subId && customerId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subId, {
              expand: ["items.data.price"],
            });
            await updateUserSubscriptionFromStripe(
              userId,
              subscription,
              customerId
            );
          } catch (err) {
            console.error("subscription checkout.session.completed", err);
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
          });
        } catch (err) {
          console.error("markInvoicePaidWithFees webhook", err);
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
        console.error("customer.subscription.updated", err);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      try {
        await markSubscriptionCanceled(subscription.id);
      } catch (err) {
        console.error("customer.subscription.deleted", err);
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
        } catch (err) {
          console.error("markInvoicePaidWithFees PI webhook", err);
        }
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

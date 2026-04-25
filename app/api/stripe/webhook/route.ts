import { markInvoicePaidWithFees } from "@/lib/fees/mark-invoice-paid";
import { serverError } from "@/lib/api/errors";
import { getStripe } from "@/lib/stripe/connect";
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.paid_invoice_id;
      const userId = session.metadata?.supabase_user_id;
      if (invoiceId && userId) {
        try {
          await markInvoicePaidWithFees(admin, {
            userId,
            invoiceId,
          });
        } catch (err) {
          console.error("markInvoicePaidWithFees webhook", err);
        }
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

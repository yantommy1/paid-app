import { serverError } from "@/lib/api/errors";
import { getStripe } from "@/lib/stripe/connect";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  priceId: z.string().min(1),
  plan: z.enum(["starter", "pro"]).optional(),
  email: z.string().email(),
});

const APP_BASE = "https://paid-app.com";
const SUCCESS_URL = `${APP_BASE}/success?session_id={CHECKOUT_SESSION_ID}`;
const CANCEL_URL = `${APP_BASE}`;

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return serverError("Stripe is not configured.", 500);
  }
  const starter = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const pro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (!starter || !pro) {
    return serverError("Pricing is not configured.", 500);
  }

  let json: unknown = null;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }

  const payload = BodySchema.safeParse(json);
  if (!payload.success) {
    return serverError("Invalid payload", 400);
  }

  const { priceId, plan, email } = payload.data;
  if (priceId !== starter && priceId !== pro) {
    return serverError("Invalid priceId", 400);
  }

  const stripe = getStripe();

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const customerSearch = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    });
    let customerId = customerSearch.data[0]?.id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: normalizedEmail });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_email: normalizedEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: 30,
        metadata: { plan: plan ?? "starter" },
      },
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      metadata: {
        checkout_email: normalizedEmail,
        plan: plan ?? "starter",
        checkout_purpose: "saas_subscription",
      },
    });

    if (!session.url) {
      return serverError("Checkout session missing URL", 500);
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("No such price")) {
      return serverError("Selected plan is unavailable. Please try again.", 400);
    }
    return serverError("Unable to start checkout right now.", 500);
  }
}

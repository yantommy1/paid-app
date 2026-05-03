import { serverError } from "@/lib/api/errors";
import { getStripe } from "@/lib/stripe/connect";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  priceId: z.string().min(1),
  plan: z.enum(["starter", "pro", "firm"]).optional(),
  email: z.string().email(),
  fullName: z.string().trim().min(1).max(160).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
});

const APP_BASE = "https://paid-app.com";
const SUCCESS_URL = `${APP_BASE}/success?session_id={CHECKOUT_SESSION_ID}`;
const CANCEL_URL = `${APP_BASE}`;

export async function POST(request: NextRequest) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const starter = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const pro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  const firm = process.env.STRIPE_FIRM_PRICE_ID?.trim();

  if (!stripeSecret) {
    console.error("[create-checkout] Missing STRIPE_SECRET_KEY");
    return serverError("Missing environment variable: STRIPE_SECRET_KEY", 500);
  }
  if (!starter || !pro) {
    console.error("[create-checkout] Missing price IDs", {
      hasStarter: Boolean(starter),
      hasPro: Boolean(pro),
      hasFirm: Boolean(firm),
    });
    return serverError(
      "Missing environment variables: STRIPE_STARTER_PRICE_ID or STRIPE_PRO_PRICE_ID",
      500
    );
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

  const { priceId, plan, email, fullName, firstName, lastName } = payload.data;
  const validPriceIds = [starter, pro, firm].filter(Boolean) as string[];
  if (!validPriceIds.includes(priceId)) {
    console.error("[create-checkout] Invalid priceId", { priceId });
    return serverError("Invalid priceId", 400);
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Stripe init error";
    console.error("[create-checkout] Stripe client initialization failed", { message });
    return serverError(`Stripe initialization failed: ${message}`, 500);
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName =
      fullName?.trim() || [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || undefined;
    const customerSearch = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    });
    let customerId = customerSearch.data[0]?.id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: normalizedEmail,
        name: normalizedName,
      });
      customerId = customer.id;
      console.info("[create-checkout] Created customer", {
        customerId,
        email: normalizedEmail,
      });
    } else {
      console.info("[create-checkout] Reused customer", {
        customerId,
        email: normalizedEmail,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
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
        checkout_full_name: normalizedName ?? "",
        checkout_first_name: firstName?.trim() ?? "",
        checkout_last_name: lastName?.trim() ?? "",
        checkout_name: normalizedName ?? "",
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
    console.error("[create-checkout] Failed to create checkout session", {
      error: message || "unknown",
      requestPath: request.nextUrl.pathname,
    });
    if (message.includes("No such price")) {
      return serverError("Selected plan is unavailable. Please try again.", 400);
    }
    if (message.includes("Invalid API Key")) {
      return serverError("Stripe API key is invalid. Check STRIPE_SECRET_KEY.", 500);
    }
    return serverError(`Checkout failed: ${message || "unknown Stripe error"}`, 500);
  }
}

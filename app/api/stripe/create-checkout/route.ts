import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { getStripe } from "@/lib/stripe/connect";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  priceId: z.string().min(1),
  plan: z.enum(["starter", "pro"]),
});

const APP_BASE = "https://paid-app.com";
const SUCCESS_URL = `${APP_BASE}/success`;
const CANCEL_URL = `${APP_BASE}/pricing`;

export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const starter = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const pro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (!process.env.STRIPE_SECRET_KEY) {
    return serverError("Stripe is not configured.", 500);
  }
  if (!starter || !pro) {
    return serverError("Pricing is not configured.", 500);
  }

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

  const { priceId, plan } = parsed.data;
  if (priceId !== starter && priceId !== pro) {
    return serverError("Invalid priceId", 400);
  }

  const supabase = await createRouteHandlerClient(request);
  const email = ctx.user.email ?? "";
  if (!email) {
    return serverError("User email required for checkout", 400);
  }

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", ctx.user.id)
    .single();

  if (userErr || !userRow) {
    return serverError(userErr?.message ?? "User not found", 500);
  }

  const stripe = getStripe();
  let customerId = userRow.stripe_customer_id as string | null;

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: ctx.user.id },
      });
      customerId = customer.id;
      const { error: upErr } = await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", ctx.user.id);
      if (upErr) {
        return serverError(upErr.message, 500);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          supabase_user_id: ctx.user.id,
          plan,
        },
      },
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      metadata: {
        supabase_user_id: ctx.user.id,
        plan,
        checkout_purpose: "saas_subscription",
      },
      client_reference_id: ctx.user.id,
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

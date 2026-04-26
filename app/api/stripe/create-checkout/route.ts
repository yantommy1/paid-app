import { serverError } from "@/lib/api/errors";
import { getStripe } from "@/lib/stripe/connect";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  priceId: z.string().min(1),
  plan: z.enum(["starter", "pro"]),
  email: z.string().email().optional(),
});

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://paid-app.com";
const SUCCESS_URL_LOGGED_IN = `${APP_BASE}/success`;
const SUCCESS_URL_GUEST = `${APP_BASE}/onboarding`;
const CANCEL_URL = `${APP_BASE}/pricing`;

function parsePayload(request: NextRequest, body: unknown) {
  const parsed = BodySchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const fromQuery = BodySchema.safeParse({
    priceId: request.nextUrl.searchParams.get("priceId") ?? "",
    plan: request.nextUrl.searchParams.get("plan"),
    email: request.nextUrl.searchParams.get("email") ?? undefined,
  });
  if (fromQuery.success) return fromQuery.data;
  return null;
}

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return serverError("Stripe is not configured.", 500);
  }
  const starter = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const pro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (!starter || !pro) {
    return serverError("Pricing is not configured.", 500);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }

  const payload = parsePayload(request, json);
  if (!payload) {
    return serverError("Invalid payload", 400);
  }

  const { priceId, plan, email } = payload;
  if (priceId !== starter && priceId !== pro) {
    return serverError("Invalid priceId", 400);
  }

  const supabase = await createRouteHandlerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const stripe = getStripe();
  let customerId: string | null = null;
  const checkoutEmail = (user?.email ?? email ?? "").trim() || undefined;

  try {
    if (user) {
      const { data: userRow } = await supabase
        .from("users")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();
      customerId = (userRow?.stripe_customer_id as string | null) ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: checkoutEmail,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
        await supabase
          .from("users")
          .update({ stripe_customer_id: customerId })
          .eq("id", user.id);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(customerId ? { customer: customerId } : {}),
      ...(!customerId && checkoutEmail ? { customer_email: checkoutEmail } : {}),
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          ...(user?.id ? { supabase_user_id: user.id } : {}),
          plan,
        },
      },
      success_url: user ? SUCCESS_URL_LOGGED_IN : SUCCESS_URL_GUEST,
      cancel_url: CANCEL_URL,
      metadata: {
        ...(user?.id ? { supabase_user_id: user.id } : {}),
        ...(checkoutEmail ? { checkout_email: checkoutEmail } : {}),
        plan,
        checkout_purpose: "saas_subscription",
      },
      ...(user?.id ? { client_reference_id: user.id } : {}),
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

export async function GET(request: NextRequest) {
  const body = {
    priceId: request.nextUrl.searchParams.get("priceId") ?? "",
    plan: request.nextUrl.searchParams.get("plan"),
    email: request.nextUrl.searchParams.get("email") ?? undefined,
  };
  const fakeRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  });
  const res = await POST(fakeRequest);
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (res.ok && json.url) {
    return NextResponse.redirect(json.url);
  }
  const backToPricing = `${CANCEL_URL}?message=checkout`;
  return NextResponse.redirect(backToPricing);
}

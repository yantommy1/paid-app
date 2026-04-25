import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { getStripe } from "@/lib/stripe/connect";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://paid-app.com";

export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: userRow, error } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", ctx.user.id)
    .single();

  if (error || !userRow?.stripe_customer_id) {
    return serverError("No Stripe customer on file. Subscribe from Pricing first.", 400);
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: userRow.stripe_customer_id as string,
      return_url: `${APP_URL.replace(/\/$/, "")}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Portal session failed";
    return serverError(message, 500);
  }
}

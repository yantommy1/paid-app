import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createConnectOnboarding } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.NEXT_PUBLIC_APP_URL) {
    return serverError("Stripe Connect is not configured.", 500);
  }
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const returnUrl = `${appUrl}/onboarding?step=stripe-done`;

  try {
    const { url, accountId } = await createConnectOnboarding(
      ctx.user.id,
      ctx.user.email ?? "",
      returnUrl
    );

    const admin = createAdminClient();
    await admin
      .from("users")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", ctx.user.id);

    return NextResponse.json({ url, accountId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe Connect failed";
    return serverError(message);
  }
}

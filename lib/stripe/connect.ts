import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

/** Create a Stripe Connect Express account and return an onboarding Account Link URL. */
export async function createConnectOnboarding(
  userId: string,
  email: string,
  returnUrl: string
): Promise<{ url: string; accountId: string }> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email,
    metadata: { supabase_user_id: userId },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return { url: link.url, accountId: account.id };
}

/**
 * Example: create a Checkout Session on the connected account with an application fee
 * (Paid's contingency fee). Caller supplies line items / amount in production.
 */
export async function createDestinationCheckout(params: {
  connectedAccountId: string;
  amountCents: number;
  applicationFeeCents: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ url: string | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Invoice payment (via Paid)" },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: params.applicationFeeCents,
        metadata: params.metadata,
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    },
    { stripeAccount: params.connectedAccountId }
  );
  return { url: session.url };
}

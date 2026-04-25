import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

/** Map Stripe statuses to values we store and gate on. */
export function normalizeSubscriptionStatus(
  status: Stripe.Subscription.Status
): "trialing" | "active" | "past_due" | "canceled" | "incomplete" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "active";
    default:
      return "active";
  }
}

export function subscriptionRowFromStripe(
  subscription: Stripe.Subscription,
  customerId: string
): {
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  subscription_status: ReturnType<typeof normalizeSubscriptionStatus>;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
} {
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const trialEndSec = subscription.trial_end;
  const trial_ends_at =
    trialEndSec != null ? new Date(trialEndSec * 1000).toISOString() : null;
  const periodEndSec = subscription.current_period_end;
  const subscription_ends_at =
    periodEndSec != null ? new Date(periodEndSec * 1000).toISOString() : null;

  return {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    subscription_status: normalizeSubscriptionStatus(subscription.status),
    trial_ends_at,
    subscription_ends_at,
  };
}

export async function updateUserSubscriptionFromStripe(
  userId: string,
  subscription: Stripe.Subscription,
  customerId: string
): Promise<void> {
  const admin = createAdminClient();
  const row = subscriptionRowFromStripe(subscription, customerId);
  const { error } = await admin.from("users").update(row).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function updateUserSubscriptionByCustomerId(
  customerId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const admin = createAdminClient();
  const { data: byCustomer, error: findErr } = await admin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);

  let userId = byCustomer?.id as string | undefined;
  if (!userId) {
    const { data: bySub } = await admin
      .from("users")
      .select("id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    userId = bySub?.id as string | undefined;
  }
  if (!userId) return;

  await updateUserSubscriptionFromStripe(userId, subscription, customerId);
}

export async function markSubscriptionCanceled(
  subscriptionId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ subscription_status: "canceled" })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(error.message);
}

/**
 * Plan utility — single source of truth for "what features does this user
 * get?" Read from a Supabase user row's subscription fields.
 *
 * v1.7.0: collapsed from Starter / Pro / Firm to Starter / Pro. Firm is
 * gone until multi-tenant infrastructure exists to back its promises.
 *
 * Trial users get full Pro features. The trial sells the upgrade — if we
 * withheld features during the trial period, the trial wouldn't earn its
 * keep.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "starter" | "pro";

export type PlanFeatures = {
  /** Distinct invoices the user can send reminders for per calendar month.
   *  `null` means unlimited. The 50 cap on Starter matches the pricing
   *  page's "Up to 50 active invoices" promise. */
  activeReminderInvoiceCap: number | null;
  /** Show the friendly/professional/firm tone toggle in the add-on. */
  toneSelector: boolean;
  /** Run computeAutoTone's client-history adjust logic. */
  toneAutoAdjust: boolean;
  /** Auto-classify client replies + auto-schedule follow-ups. */
  replyClassification: boolean;
  /** Early-pay discount + payment plan offer extras on the draft preview. */
  paymentPlanExtras: boolean;
  /** Generate share tokens for bookkeeper access. */
  bookkeeperShareLink: boolean;
};

const STARTER: PlanFeatures = {
  activeReminderInvoiceCap: 50,
  toneSelector: false,
  toneAutoAdjust: false,
  replyClassification: false,
  paymentPlanExtras: false,
  bookkeeperShareLink: false,
};

const PRO: PlanFeatures = {
  activeReminderInvoiceCap: null,
  toneSelector: true,
  toneAutoAdjust: true,
  replyClassification: true,
  paymentPlanExtras: true,
  bookkeeperShareLink: true,
};

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  starter: STARTER,
  pro: PRO,
};

export function featuresFor(plan: Plan): PlanFeatures {
  return PLAN_FEATURES[plan];
}

type SubscriptionRow = {
  stripe_price_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
};

/**
 * Derive a plan from the user's stored subscription state. Single function
 * used everywhere so the rules can never drift between API routes / add-on /
 * web settings.
 */
export function planFromRow(row: SubscriptionRow | null | undefined): Plan {
  const status = row?.subscription_status ?? null;
  const priceId = row?.stripe_price_id ?? null;
  const pro = process.env.STRIPE_PRO_PRICE_ID?.trim();

  // Trial → Pro. Withholding features during trial would torpedo upgrade
  // conversion; we want trialists hooked on the full product.
  if (status === "trialing") return "pro";

  // Currently paying (or being chased for payment) → the tier they bought.
  if (status === "active" || status === "past_due") {
    if (pro && priceId === pro) return "pro";
    return "starter";
  }

  // Canceled but still inside paid period — honor the grace window.
  if (status === "canceled" && row?.subscription_ends_at) {
    const endsAt = Date.parse(row.subscription_ends_at);
    if (Number.isFinite(endsAt) && endsAt > Date.now()) {
      if (pro && priceId === pro) return "pro";
      return "starter";
    }
  }

  // No subscription, incomplete, expired, or anything we don't recognize.
  // Default is Starter — locked features, free.
  return "starter";
}

export async function getUserPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<Plan> {
  const { data } = await supabase
    .from("users")
    .select("stripe_price_id, subscription_status, trial_ends_at, subscription_ends_at")
    .eq("id", userId)
    .maybeSingle();
  return planFromRow(data as SubscriptionRow | null);
}

/**
 * 402 Payment Required response body shape. Returned by API routes that
 * gate a feature behind Pro. The client renders this as an inline upgrade
 * prompt rather than a generic error.
 */
export function upgradeRequiredBody(feature: keyof PlanFeatures, message?: string) {
  return {
    error: "Upgrade required",
    code: "UPGRADE_REQUIRED",
    feature,
    message:
      message ??
      "This feature is part of the Pro plan. Upgrade in your Paid settings to enable it.",
  };
}

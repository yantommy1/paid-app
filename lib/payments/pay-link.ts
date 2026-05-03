import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentLinkConfig = {
  enabled: boolean;
  earlyPayDiscountPct: number;
  earlyPayDiscountDays: number;
  paymentPlanEnabled: boolean;
  paymentPlanInstallments: number;
  payNowButtonLabel: string;
};

export type ResolvedPaymentLink = {
  payNowUrl: string;
  payNowLabel: string;
  earlyPayLine: string | null;
  paymentPlanUrl: string | null;
};

const DEFAULT_PAY_NOW_LABEL = "Pay invoice online";

function appBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://paid-app.com"
  );
}

/**
 * Builds the Pay Now URL + optional discount line + optional payment plan URL for a reminder.
 * Honors per-user settings (configured in Settings) and per-invoice overrides.
 *
 * Returns null payNowUrl if either:
 *   - the user has disabled payment links in settings, OR
 *   - the user has no Stripe Connect account configured.
 */
export async function resolvePaymentLink(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string,
  overrides?: { discountPct?: number | null; planEnabled?: boolean | null }
): Promise<ResolvedPaymentLink | null> {
  const { data: user } = await supabase
    .from("users")
    .select("stripe_connect_account_id")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.stripe_connect_account_id) {
    return null;
  }

  const { data: settings } = await supabase
    .from("settings")
    .select(
      "payment_link_enabled, early_pay_discount_pct, early_pay_discount_days, payment_plan_enabled, payment_plan_installments, pay_now_button_label"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const cfg: PaymentLinkConfig = {
    enabled: settings?.payment_link_enabled ?? true,
    earlyPayDiscountPct: Number(settings?.early_pay_discount_pct ?? 0),
    earlyPayDiscountDays: Number(settings?.early_pay_discount_days ?? 7),
    paymentPlanEnabled: Boolean(settings?.payment_plan_enabled),
    paymentPlanInstallments: Number(settings?.payment_plan_installments ?? 3),
    payNowButtonLabel: settings?.pay_now_button_label ?? DEFAULT_PAY_NOW_LABEL,
  };

  if (!cfg.enabled) return null;

  const discountPct =
    overrides?.discountPct === null
      ? 0
      : (overrides?.discountPct ?? cfg.earlyPayDiscountPct);
  const planEnabled =
    overrides?.planEnabled === null
      ? false
      : (overrides?.planEnabled ?? cfg.paymentPlanEnabled);

  const base = appBase();
  const params = new URLSearchParams();
  if (discountPct > 0) {
    params.set("d", discountPct.toFixed(2));
    params.set("dd", String(cfg.earlyPayDiscountDays));
  }
  const qs = params.toString();
  const payNowUrl = `${base}/pay/${invoiceId}${qs ? `?${qs}` : ""}`;

  const earlyPayLine =
    discountPct > 0
      ? `${discountPct % 1 === 0 ? discountPct.toFixed(0) : discountPct.toFixed(1)}% discount if paid within ${cfg.earlyPayDiscountDays} days`
      : null;

  const paymentPlanUrl = planEnabled
    ? `${base}/pay/${invoiceId}/plan?n=${cfg.paymentPlanInstallments}`
    : null;

  return {
    payNowUrl,
    payNowLabel: cfg.payNowButtonLabel,
    earlyPayLine,
    paymentPlanUrl,
  };
}

/**
 * Builds the plain-text payment block to append after the LLM-drafted body.
 * Includes Pay Now URL + optional payment plan URL. Discount text is woven into
 * the AI body via earlyPayLine (passed as earlyPayOfferLine to draft helper).
 */
export function formatPaymentBlock(link: ResolvedPaymentLink): string {
  const lines: string[] = [];
  lines.push(`${link.payNowLabel}: ${link.payNowUrl}`);
  if (link.paymentPlanUrl) {
    lines.push(`Need more time? Choose a payment plan: ${link.paymentPlanUrl}`);
  }
  return lines.join("\n");
}

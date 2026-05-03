import { draftReminderEmail } from "@/lib/anthropic/draft";
import { type Tone, computeAutoTone } from "@/lib/tone/compute";
import {
  formatPaymentBlock,
  resolvePaymentLink,
  type ResolvedPaymentLink,
} from "@/lib/payments/pay-link";
import type { InvoiceRow } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BuildReminderOptions = {
  /** Override the computed tone. */
  toneOverride?: Tone;
  /** If true, force-disable Pay Now even if user has Stripe Connect. */
  disablePayLink?: boolean;
  /** Per-invoice override of discount percent (null = no discount). */
  discountPctOverride?: number | null;
  /** Per-invoice override of payment plan availability. */
  paymentPlanOverride?: boolean | null;
};

export type BuiltReminder = {
  subject: string;
  body: string;
  tone: Tone;
  payNowUrl: string | null;
  payNowIncluded: boolean;
  discountPct: number | null;
  paymentLink: ResolvedPaymentLink | null;
};

/**
 * Centralized reminder builder used by every send/draft/queue path so tone, payment links,
 * and discount logic are computed identically. Never sends; just builds.
 */
export async function buildReminderForInvoice(
  supabase: SupabaseClient,
  userId: string,
  invoice: Pick<
    InvoiceRow,
    | "id"
    | "client_name"
    | "client_email"
    | "amount"
    | "days_overdue"
    | "due_date"
    | "quickbooks_invoice_id"
    | "line_items"
    | "memo"
  >,
  senderName: string,
  options: BuildReminderOptions = {}
): Promise<BuiltReminder> {
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("tone_default, tone_auto_adjust")
    .eq("user_id", userId)
    .maybeSingle();

  const toneSettings = {
    tone_default: (settingsRow?.tone_default as Tone | undefined) ?? "professional",
    tone_auto_adjust: settingsRow?.tone_auto_adjust ?? true,
  };

  const tone =
    options.toneOverride ??
    (await computeAutoTone(
      supabase,
      userId,
      {
        id: invoice.id,
        amount: Number(invoice.amount),
        days_overdue: invoice.days_overdue,
        client_email: invoice.client_email,
      },
      toneSettings
    ));

  const paymentLink = options.disablePayLink
    ? null
    : await resolvePaymentLink(supabase, userId, invoice.id, {
        discountPct: options.discountPctOverride,
        planEnabled: options.paymentPlanOverride,
      });

  const draft = await draftReminderEmail(
    {
      client_name: invoice.client_name,
      amount: invoice.amount,
      days_overdue: invoice.days_overdue,
      due_date: invoice.due_date,
      quickbooks_invoice_id: invoice.quickbooks_invoice_id,
      line_items: invoice.line_items ?? null,
      memo: invoice.memo ?? null,
    },
    senderName,
    invoice.client_name,
    {
      tone,
      paymentLineHint: paymentLink ? formatPaymentBlock(paymentLink) : undefined,
      earlyPayOfferLine: paymentLink?.earlyPayLine ?? undefined,
    }
  );

  return {
    subject: draft.subject,
    body: draft.body,
    tone: draft.tone,
    payNowUrl: paymentLink?.payNowUrl ?? null,
    payNowIncluded: Boolean(paymentLink?.payNowUrl),
    discountPct: paymentLink?.earlyPayLine
      ? Number(/[\d.]+/.exec(paymentLink.earlyPayLine)?.[0] ?? null)
      : null,
    paymentLink,
  };
}

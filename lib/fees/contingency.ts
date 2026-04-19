import type { InvoiceRow } from "@/lib/types";

/** Percentage owed to Paid when an invoice is collected (60+ day recovery tiers). */
export function feePercentFromSettings(
  daysOverdue: number,
  settings: { fee_60_day: number; fee_90_day: number } | null
): number {
  const s = settings ?? { fee_60_day: 5, fee_90_day: 10 };
  if (daysOverdue >= 90) return Number(s.fee_90_day);
  if (daysOverdue >= 60) return Number(s.fee_60_day);
  return 0;
}

/** @deprecated use feePercentFromSettings with settings row */
export function feePercentForInvoice(invoice: Pick<InvoiceRow, "days_overdue">): number {
  return feePercentFromSettings(invoice.days_overdue, null);
}

export function feeAmountFromSettings(
  invoice: Pick<InvoiceRow, "amount" | "days_overdue">,
  settings: { fee_60_day: number; fee_90_day: number } | null
): number {
  const pct = feePercentFromSettings(invoice.days_overdue, settings);
  return Math.round((Number(invoice.amount) * pct) / 100 * 100) / 100;
}

export function feeAmountForInvoice(
  invoice: Pick<InvoiceRow, "amount" | "days_overdue">
): number {
  return feeAmountFromSettings(invoice, null);
}

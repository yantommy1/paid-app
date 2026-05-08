/**
 * Pre-flight classifier for QuickBooks Payment push. Pure — given the data
 * we'd fetch before making the QB API call, decide whether to skip and why.
 * Extracted so we can unit-test idempotency without a live QB or DB.
 */

export type PushPaymentPreflightInput = {
  invoice: {
    id: string;
    quickbooks_payment_id: string | null;
    quickbooks_customer_id: string | null;
  } | null;
  settings: { quickbooks_auto_record_payments: boolean | null } | null;
  hasQuickBooksToken: boolean;
};

export type PushPaymentPreflight =
  | { proceed: true }
  | {
      proceed: false;
      skipped:
        | "invoice_not_found"
        | "already_pushed"
        | "missing_customer"
        | "auto_record_disabled"
        | "no_qb_token";
    };

export function classifyPushPaymentPreflight(
  input: PushPaymentPreflightInput
): PushPaymentPreflight {
  const { invoice, settings, hasQuickBooksToken } = input;
  if (!invoice) return { proceed: false, skipped: "invoice_not_found" };
  if (invoice.quickbooks_payment_id) {
    // Idempotency: if we've already pushed this invoice, never push again.
    return { proceed: false, skipped: "already_pushed" };
  }
  if (!invoice.quickbooks_customer_id) {
    return { proceed: false, skipped: "missing_customer" };
  }
  if (settings && settings.quickbooks_auto_record_payments === false) {
    return { proceed: false, skipped: "auto_record_disabled" };
  }
  if (!hasQuickBooksToken) {
    return { proceed: false, skipped: "no_qb_token" };
  }
  return { proceed: true };
}

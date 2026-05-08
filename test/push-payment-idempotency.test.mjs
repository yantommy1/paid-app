/**
 * QuickBooks push-payment idempotency.
 *
 * The Stripe webhook retries every event up to 3 days on 5xx; the manual
 * mark-paid path can also fire concurrently with the webhook. If push
 * isn't idempotent, the customer's QuickBooks gets a duplicate Payment
 * entry — which silently miscounts revenue and is annoying to clean up.
 *
 * The pure pre-flight classifier returns "already_pushed" iff
 * invoice.quickbooks_payment_id is set. These tests lock that, plus the
 * other pre-API skip reasons.
 */

// Hand-port of lib/quickbooks/push-payment-pure.ts — keep in sync.
function classifyPushPaymentPreflight(input) {
  const { invoice, settings, hasQuickBooksToken } = input;
  if (!invoice) return { proceed: false, skipped: "invoice_not_found" };
  if (invoice.quickbooks_payment_id) {
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

function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`
    );
  }
}

const baseInvoice = {
  id: "inv-1",
  quickbooks_payment_id: null,
  quickbooks_customer_id: "qb-cust-1",
};

export default [
  {
    name: "push-payment: first call proceeds",
    run: () => {
      assertEqual(
        classifyPushPaymentPreflight({
          invoice: baseInvoice,
          settings: { quickbooks_auto_record_payments: true },
          hasQuickBooksToken: true,
        }),
        { proceed: true },
        "fully-configured first call must proceed"
      );
    },
  },
  {
    name: "push-payment: second call (already_pushed) skips",
    run: () => {
      assertEqual(
        classifyPushPaymentPreflight({
          invoice: { ...baseInvoice, quickbooks_payment_id: "qb-payment-1" },
          settings: { quickbooks_auto_record_payments: true },
          hasQuickBooksToken: true,
        }),
        { proceed: false, skipped: "already_pushed" },
        "presence of quickbooks_payment_id must short-circuit before API call"
      );
    },
  },
  {
    name: "push-payment: missing customer skips",
    run: () => {
      assertEqual(
        classifyPushPaymentPreflight({
          invoice: { ...baseInvoice, quickbooks_customer_id: null },
          settings: { quickbooks_auto_record_payments: true },
          hasQuickBooksToken: true,
        }),
        { proceed: false, skipped: "missing_customer" },
        "missing CustomerRef must skip with missing_customer"
      );
    },
  },
  {
    name: "push-payment: settings opt-out skips",
    run: () => {
      assertEqual(
        classifyPushPaymentPreflight({
          invoice: baseInvoice,
          settings: { quickbooks_auto_record_payments: false },
          hasQuickBooksToken: true,
        }),
        { proceed: false, skipped: "auto_record_disabled" },
        "settings.quickbooks_auto_record_payments=false must skip"
      );
    },
  },
  {
    name: "push-payment: no QB token skips",
    run: () => {
      assertEqual(
        classifyPushPaymentPreflight({
          invoice: baseInvoice,
          settings: { quickbooks_auto_record_payments: true },
          hasQuickBooksToken: false,
        }),
        { proceed: false, skipped: "no_qb_token" },
        "missing QB token must skip with no_qb_token"
      );
    },
  },
];

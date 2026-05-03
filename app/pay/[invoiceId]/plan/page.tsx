import { PayStatus } from "@/components/pay/PayStatus";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment plan — Paid" };

export const dynamic = "force-dynamic";

export default async function PaymentPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const { invoiceId } = await params;
  const sp = await searchParams;
  const installments = Math.max(2, Math.min(12, Number(sp.n ?? 3)));

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invoices")
    .select("amount, client_name, client_email, user_id, quickbooks_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!inv) {
    return (
      <PayStatus
        title="We could not find that invoice."
        body="The payment plan link may be expired. Reply to the original email to arrange terms with the merchant."
      />
    );
  }

  const { data: ownerRow } = await admin
    .from("users")
    .select("email")
    .eq("id", inv.user_id)
    .maybeSingle();

  const merchantEmail = ownerRow?.email ?? "";
  const perInstallment = (Number(inv.amount) / installments).toFixed(2);
  const subject = `Payment plan request — invoice ${inv.quickbooks_invoice_id}`;
  const body = `Hi,\n\nI would like to set up a payment plan for invoice ${inv.quickbooks_invoice_id} (total $${Number(inv.amount).toFixed(2)}). Could we split it into ${installments} monthly installments of approximately $${perInstallment}?\n\nThanks,\n${inv.client_name}`;
  const mailto = `mailto:${merchantEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <PayStatus
      title={`Spread this over ${installments} months?`}
      body={`Invoice total is $${Number(inv.amount).toFixed(2)}, which works out to about $${perInstallment} per month over ${installments} months. The button below opens a pre-written email asking the merchant to confirm. They will reply with payment details.`}
      cta={{ label: "Email the merchant", href: mailto }}
    />
  );
}

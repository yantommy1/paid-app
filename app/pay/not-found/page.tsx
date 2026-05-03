import { PayStatus } from "@/components/pay/PayStatus";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Invoice not found — Paid" };

export default function NotFoundPage() {
  return (
    <PayStatus
      title="We could not find that invoice."
      body="The link may be expired or mistyped. Please reply to the original email and the merchant can resend a fresh link."
    />
  );
}

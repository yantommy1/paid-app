import { PayStatus } from "@/components/pay/PayStatus";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment canceled — Paid" };

export default function CanceledPage() {
  return (
    <PayStatus
      title="Payment canceled."
      body="No charges were made. Use the Pay Now link in the email when you are ready, or reply to the sender if you have questions about the invoice."
    />
  );
}

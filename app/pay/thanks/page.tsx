import { PayStatus } from "@/components/pay/PayStatus";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment received — Paid" };

export default function ThanksPage() {
  return (
    <PayStatus
      title="Payment received."
      body="Thanks for paying. A receipt will be emailed to you shortly. The merchant has been notified."
    />
  );
}

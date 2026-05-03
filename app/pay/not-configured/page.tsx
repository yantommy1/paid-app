import { PayStatus } from "@/components/pay/PayStatus";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Online payment unavailable — Paid" };

export default function NotConfiguredPage() {
  return (
    <PayStatus
      title="Online payment is not set up for this invoice."
      body="The merchant has not connected a payment processor yet. Please reply to the original email to arrange payment by check, ACH, or wire."
    />
  );
}

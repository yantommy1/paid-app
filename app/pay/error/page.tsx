import { PayStatus } from "@/components/pay/PayStatus";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment error — Paid" };

export default function ErrorPage() {
  return (
    <PayStatus
      title="Something went wrong setting up payment."
      body="Please try the link again in a minute. If it keeps failing, reply to the original email — the merchant has been notified."
    />
  );
}

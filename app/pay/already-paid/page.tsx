import { PayStatus } from "@/components/pay/PayStatus";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Already paid — Paid" };

export default function AlreadyPaidPage() {
  return (
    <PayStatus
      title="This invoice is already marked paid."
      body="Our records show this invoice has been settled. If that does not match what you see on your end, reply to the original email and the merchant will get in touch."
    />
  );
}

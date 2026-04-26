import { HomeLanding } from "@/components/landing/HomeLanding";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paid — AI invoice reminders for faster collections",
  description:
    "Paid helps professional services firms collect overdue invoices with AI-drafted reminders sent from Gmail.",
};

export default function HomePage() {
  return <HomeLanding starterPriceId={process.env.STRIPE_STARTER_PRICE_ID?.trim() ?? ""} />;
}

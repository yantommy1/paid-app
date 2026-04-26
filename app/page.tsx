import { HomeLanding } from "@/components/landing/HomeLanding";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paid — AI invoice reminders for faster collections",
  description:
    "Paid helps professional services firms collect overdue invoices with AI-drafted reminders sent from Gmail.",
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <HomeLanding
      starterPriceId={process.env.STRIPE_STARTER_PRICE_ID?.trim() ?? ""}
      proPriceId={process.env.STRIPE_PRO_PRICE_ID?.trim() ?? ""}
      isLoggedIn={Boolean(user)}
      userEmail={user?.email ?? null}
      userDisplayName={user ? getUserDisplayName(user) : null}
    />
  );
}

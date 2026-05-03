import { HomeLanding } from "@/components/landing/HomeLanding";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paid — We turn your inbox into your collections team",
  description:
    "Paid finds every overdue invoice in your QuickBooks, drafts the follow-up in your voice, and queues it in your Gmail for one-click approval. Built for engineering, architecture, and professional services firms.",
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
      firmPriceId={process.env.STRIPE_FIRM_PRICE_ID?.trim() ?? ""}
      isLoggedIn={Boolean(user)}
      userEmail={user?.email ?? null}
      userDisplayName={user ? getUserDisplayName(user) : null}
    />
  );
}

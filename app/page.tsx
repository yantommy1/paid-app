import { HomeLanding } from "@/components/landing/HomeLanding";
import { getUserRoutingState, postLoginPathForState } from "@/lib/auth/post-login-path";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

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

  if (user) {
    const state = await getUserRoutingState(supabase, user.id);
    redirect(postLoginPathForState(state));
  }

  return <HomeLanding starterPriceId={process.env.STRIPE_STARTER_PRICE_ID?.trim() ?? ""} />;
}

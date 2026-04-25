import { HomeLanding } from "@/components/landing/HomeLanding";
import { postLoginPathForState } from "@/lib/auth/post-login-path";
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
    const { data: profile } = await supabase
      .from("users")
      .select("onboarding_completed, subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    const destination = postLoginPathForState({
      onboardingCompleted: profile?.onboarding_completed === true,
      subscriptionStatus: (profile?.subscription_status as string | null) ?? null,
    });

    redirect(destination);
  }

  return <HomeLanding />;
}

import { createClient } from "@/lib/supabase/server";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { postLoginPathForState } from "@/lib/auth/post-login-path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingClient } from "@/components/OnboardingClient";

const USERS_INTEGRATION_FIELDS =
  "onboarding_completed, quickbooks_token, gmail_token, subscription_status" as const;

export const metadata: Metadata = {
  title: "Onboarding — Paid",
  description: "Connect QuickBooks and Gmail to start collecting overdue invoices with Paid.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select(USERS_INTEGRATION_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed === true) {
    redirect(
      postLoginPathForState({
        onboardingCompleted: true,
        subscriptionStatus: (profile.subscription_status as string | null) ?? null,
      })
    );
  }

  const quickbooksConnected = profile != null && profile.quickbooks_token != null;
  const gmailConnected = profile != null && profile.gmail_token != null;
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-white px-6 py-16 text-[#0D0D0D]">
      <div className="mx-auto max-w-2xl">
        <OnboardingClient
          initialStep={params.step}
          displayName={getUserDisplayName(user)}
          quickbooksConnected={quickbooksConnected}
          gmailConnected={gmailConnected}
        />
      </div>
    </main>
  );
}

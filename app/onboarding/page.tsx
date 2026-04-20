import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingClient } from "@/components/OnboardingClient";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed, quickbooks_token, gmail_token")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed === true) {
    redirect("/dashboard");
  }

  /** Source of truth: DB tokens (not URL params). */
  const quickbooksConnected = profile != null && profile.quickbooks_token != null;
  const gmailConnected = profile != null && profile.gmail_token != null;

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-paid-ink px-6 py-16 text-paid-mist">
      <div className="mx-auto max-w-2xl">
        <OnboardingClient
          initialStep={params.step}
          email={user.email ?? ""}
          quickbooksConnected={quickbooksConnected}
          gmailConnected={gmailConnected}
        />
      </div>
    </main>
  );
}

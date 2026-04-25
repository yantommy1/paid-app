import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingClient } from "@/components/OnboardingClient";

const USERS_INTEGRATION_FIELDS =
  "onboarding_completed, quickbooks_token, gmail_token" as const;

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

  if (profile?.onboarding_completed === true) redirect("/dashboard");

  const quickbooksConnected = profile != null && profile.quickbooks_token != null;
  const gmailConnected = profile != null && profile.gmail_token != null;
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-white px-6 py-16 text-[#0D0D0D]">
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

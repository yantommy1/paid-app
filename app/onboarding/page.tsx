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
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed === true) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-paid-ink px-6 py-16 text-paid-mist">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <span className="font-display text-2xl tracking-tight">Paid</span>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            Setup
          </p>
        </div>
        <OnboardingClient initialStep={params.step} email={user.email ?? ""} />
      </div>
    </main>
  );
}

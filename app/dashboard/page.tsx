import { DashboardPastDueBanner } from "@/components/dashboard/DashboardPastDueBanner";
import { OverdueInvoicesPanel } from "@/components/OverdueInvoicesPanel";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

function trialDaysRemaining(trialEndsAt: string): number {
  const end = new Date(trialEndsAt).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select(
      "onboarding_completed, subscription_status, trial_ends_at, subscription_ends_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.onboarding_completed === false) {
    redirect("/onboarding");
  }

  const subStatus = profile.subscription_status as string | null;

  if (subStatus == null) {
    redirect("/pricing");
  }

  if (subStatus === "canceled" || subStatus === "incomplete") {
    redirect("/pricing?canceled=1");
  }

  const showPastDue = subStatus === "past_due";
  const showTrialing = subStatus === "trialing";
  const trialEndsAt = profile.trial_ends_at as string | null;
  const trialDays = trialEndsAt ? trialDaysRemaining(trialEndsAt) : null;

  const sp = await searchParams;
  const showSubSuccess = sp.subscription === "success";

  async function signOutAction() {
    "use server";
    const serverSupabase = await createClient();
    await serverSupabase.auth.signOut();
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
        {showSubSuccess && (
          <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Welcome — your subscription is set. You&apos;re all set to use Paid.
          </div>
        )}
        {showTrialing && trialEndsAt && trialDays !== null && (
          <div className="mb-6 rounded border border-[#E5E5E5] bg-[#F7F7F5] px-4 py-3 text-sm text-[#0D0D0D]">
            Your free trial ends in {trialDays} day{trialDays === 1 ? "" : "s"}. Add a payment
            method to continue.{" "}
            <Link href="/settings#billing" className="font-semibold text-[#1B4332] underline">
              Billing settings
            </Link>
          </div>
        )}
        {showPastDue && <DashboardPastDueBanner />}

        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E5E5] pb-6">
          <Link href="/" className="font-display text-4xl italic text-[#0D0D0D]">
            Paid
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#0D0D0D]">
            <span>{user.email}</span>
            <Link href="/settings" className="text-[#0D0D0D] hover:text-[#1B4332]">
              Settings
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded border border-[#E5E5E5] px-4 py-2 text-[#0D0D0D] hover:bg-[#F7F7F5]"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <section className="mb-8">
          <h1 className="font-display text-5xl text-[#0D0D0D]">Receivables</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#6B6B6B]">
            Open balances from QuickBooks, grouped by how late they are. Draft a reminder when
            you&apos;re ready.
          </p>
        </section>

        <OverdueInvoicesPanel />
      </div>
    </main>
  );
}

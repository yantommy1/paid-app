import { Nav } from "@/components/Nav";
import { DashboardPastDueBanner } from "@/components/dashboard/DashboardPastDueBanner";
import { DashboardROIHero } from "@/components/dashboard/DashboardROIHero";
import { OverdueInvoicesPanel } from "@/components/OverdueInvoicesPanel";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Dashboard — Paid",
  description: "Review overdue invoices, draft reminders, and send follow-ups from your Paid dashboard.",
};

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

  const subStatus = (profile?.subscription_status as string | null) ?? null;

  const showPastDue = subStatus === "past_due";
  const showTrialing = subStatus === "trialing";
  const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;
  const trialDays = trialEndsAt ? trialDaysRemaining(trialEndsAt) : null;

  const sp = await searchParams;
  const showSubSuccess = sp.subscription === "success";

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <Nav authenticated userEmail={user.email ?? null} userDisplayName={getUserDisplayName(user)} />
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

        <DashboardROIHero />

        <section className="mt-10 mb-8">
          <h1 className="font-display text-5xl text-[#0D0D0D]">Receivables</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#6B6B6B]">
            Open balances from QuickBooks, grouped by how late they are. Draft a reminder when
            you&apos;re ready — nothing sends without your approval.
          </p>
        </section>

        <OverdueInvoicesPanel />
      </div>
    </main>
  );
}

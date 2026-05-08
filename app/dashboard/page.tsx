import { Nav } from "@/components/Nav";
import { DashboardPastDueBanner } from "@/components/dashboard/DashboardPastDueBanner";
import { DashboardQuickBooksSyncBanner } from "@/components/dashboard/DashboardQuickBooksSyncBanner";
import { DashboardRecentReplies } from "@/components/dashboard/DashboardRecentReplies";
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
      "onboarding_completed, subscription_status, trial_ends_at, subscription_ends_at, quickbooks_sync_error, quickbooks_sync_error_at, quickbooks_token"
    )
    .eq("id", user.id)
    .maybeSingle();

  const qbConnected = profile?.quickbooks_token != null;
  const qbSyncError = (profile?.quickbooks_sync_error as string | null) ?? null;
  const qbSyncErrorAt =
    (profile?.quickbooks_sync_error_at as string | null) ?? null;

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

        {qbConnected && qbSyncError && (
          <DashboardQuickBooksSyncBanner
            message={qbSyncError}
            occurredAt={qbSyncErrorAt}
          />
        )}

        <DashboardROIHero />

        <section className="mt-6 flex flex-wrap items-center gap-3 border border-[#E5E5E5] bg-[#FAFAFA] px-5 py-4 text-sm">
          <span className="text-[#6B6B6B]">
            Tune the tone, Pay Now button, early-pay discount, and bookkeeper share in
          </span>
          <Link
            href="/settings"
            className="font-semibold text-[#1B4332] underline decoration-[#1B4332]/40 underline-offset-4 hover:decoration-[#1B4332]"
          >
            Reminder preferences →
          </Link>
        </section>

        <section className="mt-10 mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-5xl text-[#0D0D0D]">Receivables</h1>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#6B6B6B]">
              Open balances from QuickBooks, grouped by how late they are. Draft a reminder when
              you&apos;re ready — nothing sends without your approval.
            </p>
          </div>
          <Link
            href="/settings"
            className="border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#0D0D0D] hover:border-[#1B4332] hover:text-[#1B4332]"
          >
            Settings
          </Link>
        </section>

        <OverdueInvoicesPanel />

        <DashboardRecentReplies />
      </div>
    </main>
  );
}

import { Nav } from "@/components/Nav";
import { PricingPlans } from "@/components/pricing/PricingPlans";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Paid",
  description:
    "Start a 30-day Paid trial and automate overdue invoice reminders sent from your Gmail.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; message?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = await searchParams;
  const showCanceled =
    sp.canceled === "1" || sp.message === "canceled" || sp.message === "canceled-subscription";

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <Nav userEmail={user?.email ?? null} />

      <div className="mx-auto max-w-[1200px] px-6 py-14">
        {showCanceled && (
          <p className="mb-8 rounded border border-[#E5E5E5] bg-[#F7F7F5] px-4 py-3 text-sm text-[#0D0D0D]">
            Your subscription was canceled. Choose a plan below to subscribe again.
          </p>
        )}
        <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Pricing</p>
        <h1 className="mt-3 font-display text-5xl text-[#0D0D0D]">Start with a 30-day free trial</h1>
        <p className="mt-4 max-w-2xl text-lg text-[#6B6B6B]">
          Card required at checkout. You can change or cancel anytime from Settings.
        </p>
        <PricingPlans
          starterPriceId={process.env.STRIPE_STARTER_PRICE_ID?.trim() ?? ""}
          proPriceId={process.env.STRIPE_PRO_PRICE_ID?.trim() ?? ""}
          loggedInEmail={user?.email ?? null}
        />
      </div>
    </main>
  );
}

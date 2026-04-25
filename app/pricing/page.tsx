import { PricingPlans } from "@/components/pricing/PricingPlans";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

const APP_BASE =
  (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://paid-app.com") as string;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; message?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${APP_BASE}/#email-signup`);
  }

  const sp = await searchParams;
  const showCanceled =
    sp.canceled === "1" || sp.message === "canceled" || sp.message === "canceled-subscription";

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <nav className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-3xl text-[#0D0D0D]">
            Paid
          </Link>
          <Link href="/dashboard" className="text-sm text-[#6B6B6B] hover:text-[#0D0D0D]">
            Dashboard
          </Link>
        </div>
      </nav>

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
        />
      </div>
    </main>
  );
}

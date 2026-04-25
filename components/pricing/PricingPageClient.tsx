"use client";

import { AuthSignInModal } from "@/components/AuthSignInModal";
import { PricingPlans } from "@/components/pricing/PricingPlans";
import Link from "next/link";
import { useState } from "react";

type Props = {
  loggedIn: boolean;
  starterPriceId: string;
  proPriceId: string;
  initialEmail: string;
  showCanceled: boolean;
};

export function PricingPageClient({
  loggedIn,
  starterPriceId,
  proPriceId,
  initialEmail,
  showCanceled,
}: Props) {
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <>
      <nav className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-3xl text-[#0D0D0D]">
            Paid
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {!loggedIn ? (
              <>
                <span className="hidden text-[#6B6B6B] sm:inline">
                  Already have an account?
                </span>
                <button
                  type="button"
                  onClick={() => setSignInOpen(true)}
                  className="text-[#0D0D0D] underline decoration-[#E5E5E5] underline-offset-4 hover:decoration-[#1B4332]"
                >
                  Sign in
                </button>
              </>
            ) : (
              <Link href="/dashboard" className="text-[#6B6B6B] hover:text-[#0D0D0D]">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className="min-h-[calc(100vh-73px)] bg-white px-6 py-16 text-[#0D0D0D] md:py-24">
        <div className="mx-auto flex max-w-[960px] flex-col items-center text-center">
          {showCanceled && (
            <p className="mb-10 w-full max-w-xl rounded border border-[#E5E5E5] bg-[#F7F7F5] px-4 py-3 text-left text-sm text-[#0D0D0D]">
              Your subscription was canceled. Choose a plan below to subscribe again.
            </p>
          )}
          <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Pricing</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight tracking-tight text-[#0D0D0D] md:text-6xl">
            Simple pricing. Start free.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#6B6B6B]">
            Try Paid free for 30 days. Cancel anytime before day 31 and you won&apos;t be charged.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-[920px]">
          <PricingPlans
            starterPriceId={starterPriceId}
            proPriceId={proPriceId}
            loggedIn={loggedIn}
            initialEmail={initialEmail}
          />
        </div>
      </main>

      <AuthSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}

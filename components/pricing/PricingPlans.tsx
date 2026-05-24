"use client";

import { EmailCaptureModal } from "@/components/EmailCaptureModal";
import { useState } from "react";

type Plan = "starter" | "pro";

type Props = {
  starterPriceId: string;
  proPriceId: string;
  loggedInEmail?: string | null;
};

export function PricingPlans({ starterPriceId, proPriceId, loggedInEmail }: Props) {
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);

  function priceIdFor(plan: Plan): string {
    return plan === "starter" ? starterPriceId : proPriceId;
  }

  async function startCheckout(plan: Plan) {
    const priceId = priceIdFor(plan);
    if (!priceId) {
      setError(
        "Pricing is not configured. Set STRIPE_STARTER_PRICE_ID and STRIPE_PRO_PRICE_ID."
      );
      return;
    }
    if (!loggedInEmail) {
      setOpenPlan(plan);
      return;
    }

    setLoading(plan);
    const res = await fetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId, plan, email: loggedInEmail }),
    });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) {
      setError(typeof j.error === "string" ? j.error : "Could not start checkout.");
      setLoading(null);
      return;
    }
    window.location.href = j.url;
  }

  // Two-column pricing. The Firm tier was dropped in v1.7.0 — its
  // headline differentiators (multi-entity dashboard, cross-client
  // analytics, partner revenue share) were never built, and shipping a
  // tier that doesn't deliver what it advertises was a worse outcome
  // than only offering what the product actually does. We can add Firm
  // back once the multi-tenant architecture is real.
  return (
    <>
      <div className="mt-12 grid gap-8 md:grid-cols-2 md:max-w-3xl">
        <article className="border border-[#E5E5E5] bg-white p-8">
          <h2 className="font-display text-2xl text-[#0D0D0D]">Starter</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Solo principal</p>
          <p className="mt-4 font-display text-5xl text-[#0D0D0D]">
            $49<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
          </p>
          <p className="mt-2 text-sm text-[#6B6B6B]">30-day free trial — card required</p>
          <ul className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
            <li>Up to 50 active invoices</li>
            <li>AI-drafted reminders in your voice</li>
            <li>Pay Now button on every email</li>
            <li>QuickBooks + Gmail integration</li>
          </ul>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void startCheckout("starter")}
            className="mt-10 w-full border border-[#1B4332] py-3 text-sm font-medium text-[#1B4332] disabled:opacity-60"
          >
            {loading === "starter" ? "Loading…" : "Start free trial"}
          </button>
        </article>

        <article className="border border-[#1B4332] bg-[#F7F7F5] p-8">
          <p className="-mx-8 -mt-8 mb-6 bg-[#1B4332] px-8 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Most popular
          </p>
          <h2 className="font-display text-2xl text-[#0D0D0D]">Pro</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#1B4332]">Most A/E firms</p>
          <p className="mt-4 font-display text-5xl text-[#0D0D0D]">
            $129<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
          </p>
          <p className="mt-2 text-sm text-[#6B6B6B]">30-day free trial — card required</p>
          <ul className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
            <li>Unlimited invoices</li>
            <li>Tone control + auto-adjust by client history</li>
            <li>Reply classification &amp; auto-scheduled follow-ups</li>
            <li>Early-pay discount + payment plan options</li>
            <li>Send-to-bookkeeper share link</li>
          </ul>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void startCheckout("pro")}
            className="mt-10 w-full bg-[#1B4332] py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading === "pro" ? "Loading…" : "Start free trial"}
          </button>
        </article>

        {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
      </div>
      {openPlan && (
        <EmailCaptureModal
          isOpen={openPlan !== null}
          onClose={() => setOpenPlan(null)}
          priceId={priceIdFor(openPlan)}
          plan={openPlan}
        />
      )}
    </>
  );
}

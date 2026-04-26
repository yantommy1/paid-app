"use client";

import { SignupModal } from "@/components/SignupModal";
import { savePendingPlan } from "@/lib/billing/pending-plan";
import { useState } from "react";

type Props = {
  starterPriceId: string;
  proPriceId: string;
  loggedIn?: boolean;
  initialEmail?: string;
};

export function PricingPlans({ starterPriceId, proPriceId, loggedIn = true }: Props) {
  const [loading, setLoading] = useState<"starter" | "pro" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupPlan, setSignupPlan] = useState<"starter" | "pro" | null>(null);

  async function startCheckout(plan: "starter" | "pro") {
    const priceId = plan === "starter" ? starterPriceId : proPriceId;
    savePendingPlan({ plan, priceId });
    if (!loggedIn) {
      setSignupPlan(plan);
      return;
    }
    if (!priceId) {
      setError("Pricing is not configured. Set STRIPE_STARTER_PRICE_ID and STRIPE_PRO_PRICE_ID.");
      return;
    }
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId, plan }),
      });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setError(typeof j.error === "string" ? j.error : "Could not start checkout.");
        return;
      }
      window.location.href = j.url;
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <article className="border border-[#E5E5E5] bg-white p-8">
        <h2 className="font-display text-2xl text-[#0D0D0D]">Starter</h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">30-day free trial — card required</p>
        <p className="mt-4 font-display text-5xl text-[#0D0D0D]">
          $29<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
        </p>
        <ul className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
          <li>Up to 50 invoices</li>
          <li>AI reminders</li>
          <li>Gmail Add-On</li>
          <li>QuickBooks sync</li>
        </ul>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void startCheckout("starter")}
          className="mt-10 w-full bg-[#1B4332] py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading === "starter" ? "Loading…" : "Start free trial"}
        </button>
        </article>

        <article className="border border-[#1B4332] bg-[#F7F7F5] p-8">
        <p className="-mx-8 -mt-8 mb-6 bg-[#1B4332] px-8 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white">
          Most popular
        </p>
        <h2 className="font-display text-2xl text-[#0D0D0D]">Pro</h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">30-day free trial — card required</p>
        <p className="mt-4 font-display text-5xl text-[#0D0D0D]">
          $49<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
        </p>
        <ul className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
          <li>Unlimited invoices</li>
          <li>Custom reminder strategies</li>
          <li>Priority support</li>
          <li>Advanced recovery workflows</li>
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
      {signupPlan && (
        <SignupModal
          open
          onClose={() => setSignupPlan(null)}
          plan={signupPlan}
          priceId={signupPlan === "starter" ? starterPriceId : proPriceId}
          priceLabel={signupPlan === "starter" ? "$29/month" : "$49/month"}
        />
      )}
    </>
  );
}

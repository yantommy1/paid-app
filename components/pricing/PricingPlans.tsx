"use client";

import { mapAuthError } from "@/components/LandingEmailForm";
import { createClient } from "@/lib/supabase/browser";
import { useEffect, useId, useState } from "react";

type Props = {
  starterPriceId: string;
  proPriceId: string;
  loggedIn: boolean;
  initialEmail?: string;
};

export function PricingPlans({
  starterPriceId,
  proPriceId,
  loggedIn,
  initialEmail = "",
}: Props) {
  const [loading, setLoading] = useState<"starter" | "pro" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestPlan, setGuestPlan] = useState<"starter" | "pro" | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestMessage, setGuestMessage] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  async function startCheckout(plan: "starter" | "pro") {
    const priceId = plan === "starter" ? starterPriceId : proPriceId;
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

  async function onGuestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestPlan) return;
    setGuestBusy(true);
    setGuestMessage(null);
    setError(null);
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (signErr) {
      setGuestBusy(false);
      setGuestMessage(mapAuthError(signErr.message));
      return;
    }
    if (!data.session) {
      setGuestBusy(false);
      setGuestMessage(
        "Check your email to confirm your account. After confirming, return here and sign in to finish checkout."
      );
      return;
    }
    try {
      const priceId = guestPlan === "starter" ? starterPriceId : proPriceId;
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId, plan: guestPlan }),
      });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setGuestMessage(typeof j.error === "string" ? j.error : "Could not start checkout.");
        return;
      }
      window.location.href = j.url;
    } catch {
      setGuestMessage("Something went wrong. Try again.");
    } finally {
      setGuestBusy(false);
    }
  }

  function onPlanClick(plan: "starter" | "pro") {
    setError(null);
    setGuestMessage(null);
    if (loggedIn) {
      void startCheckout(plan);
      return;
    }
    setGuestPlan(plan);
    requestAnimationFrame(() => {
      document.getElementById("pricing-signup")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <article className="border border-[#E5E5E5] bg-white p-6 text-left shadow-sm md:p-8">
          <h2 className="font-display text-2xl text-[#0D0D0D]">Starter</h2>
          <p className="mt-2 text-sm text-[#6B6B6B]">30-day free trial — card required</p>
          <p className="mt-4 font-display text-4xl text-[#0D0D0D] md:text-5xl">
            $29<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
          </p>
          <ul className="mt-6 space-y-2 text-sm text-[#6B6B6B]">
            <li>Up to 50 invoices</li>
            <li>AI reminders</li>
            <li>Gmail Add-On</li>
            <li>QuickBooks sync</li>
          </ul>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => onPlanClick("starter")}
            className={`mt-8 w-full rounded-md py-3 text-sm font-medium text-white disabled:opacity-60 ${
              !loggedIn && guestPlan === "starter"
                ? "bg-[#0D0D0D]"
                : "bg-[#1B4332]"
            }`}
          >
            {loading === "starter" ? "Loading…" : "Start free trial"}
          </button>
        </article>

        <article className="border border-[#1B4332] bg-[#F7F7F5] p-6 text-left shadow-sm md:p-8">
          <p className="-mx-6 -mt-6 mb-5 bg-[#1B4332] px-6 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white md:-mx-8 md:-mt-8 md:mb-6 md:px-8">
            Most popular
          </p>
          <h2 className="font-display text-2xl text-[#0D0D0D]">Pro</h2>
          <p className="mt-2 text-sm text-[#6B6B6B]">30-day free trial — card required</p>
          <p className="mt-4 font-display text-4xl text-[#0D0D0D] md:text-5xl">
            $49<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
          </p>
          <ul className="mt-6 space-y-2 text-sm text-[#6B6B6B]">
            <li>Unlimited invoices</li>
            <li>Custom reminder strategies</li>
            <li>Priority support</li>
            <li>Advanced recovery workflows</li>
          </ul>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => onPlanClick("pro")}
            className={`mt-8 w-full rounded-md py-3 text-sm font-medium text-white disabled:opacity-60 ${
              !loggedIn && guestPlan === "pro" ? "bg-[#0D0D0D]" : "bg-[#1B4332]"
            }`}
          >
            {loading === "pro" ? "Loading…" : "Start free trial"}
          </button>
        </article>
      </div>

      {!loggedIn && guestPlan && (
        <div
          id="pricing-signup"
          className="mx-auto mt-12 max-w-md border border-[#E5E5E5] bg-white p-8 text-left shadow-sm"
        >
          <h3 className="font-display text-2xl text-[#0D0D0D]">Create your account</h3>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            Enter your work email and a password. We&apos;ll create your account and open secure
            Stripe checkout for the <span className="font-medium text-[#0D0D0D]">{guestPlan}</span>{" "}
            plan.
          </p>
          <form onSubmit={(e) => void onGuestSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label htmlFor={emailId} className="mb-1 block text-sm text-[#6B6B6B]">
                Work email
              </label>
              <input
                id={emailId}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                placeholder="you@firm.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor={passwordId} className="mb-1 block text-sm text-[#6B6B6B]">
                Password
              </label>
              <input
                id={passwordId}
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={guestBusy}
              className="w-full rounded-md bg-[#1B4332] py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {guestBusy ? "Working…" : "Create account and continue to checkout"}
            </button>
          </form>
          {guestMessage && (
            <p
              className={`mt-4 text-sm ${
                guestMessage.startsWith("Check your email") ? "text-[#1B4332]" : "text-red-600"
              }`}
            >
              {guestMessage}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-6 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}

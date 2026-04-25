"use client";

import { useEffect, useState } from "react";

type BillingProps = {
  planName: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export function BillingSection({
  planName,
  subscriptionStatus,
  trialEndsAt,
  subscriptionEndsAt,
}: BillingProps) {
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#billing") {
      window.setTimeout(() => {
        document.getElementById("billing")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, []);

  async function openPortal() {
    setPortalBusy(true);
    setPortalErr(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST", credentials: "include" });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setPortalErr(typeof j.error === "string" ? j.error : "Could not open billing portal.");
        return;
      }
      window.location.href = j.url;
    } catch {
      setPortalErr("Network error. Try again.");
    } finally {
      setPortalBusy(false);
    }
  }

  const statusLabel = subscriptionStatus ?? "none";
  const trialEnd = formatDate(trialEndsAt);
  const nextBill = formatDate(subscriptionEndsAt);

  return (
    <section id="billing" className="scroll-mt-24 border border-[#E5E5E5] bg-white p-6">
      <h2 className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Billing</h2>
      <h3 className="mt-2 font-display text-2xl text-[#0D0D0D]">Subscription</h3>
      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B6B6B]">Plan</dt>
          <dd className="font-medium text-[#0D0D0D]">{planName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B6B6B]">Status</dt>
          <dd className="font-medium capitalize text-[#0D0D0D]">{statusLabel}</dd>
        </div>
        {subscriptionStatus === "trialing" && trialEnd && (
          <p className="text-[#0D0D0D]">
            Your free trial ends on <span className="font-medium">{trialEnd}</span>.
          </p>
        )}
        {subscriptionStatus === "active" && nextBill && (
          <p className="text-[#6B6B6B]">
            Next billing date: <span className="font-medium text-[#0D0D0D]">{nextBill}</span>
          </p>
        )}
      </dl>
      <button
        type="button"
        disabled={portalBusy}
        onClick={() => void openPortal()}
        className="mt-6 bg-[#1B4332] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {portalBusy ? "Opening…" : "Manage billing"}
      </button>
      {portalErr && <p className="mt-3 text-sm text-red-600">{portalErr}</p>}
    </section>
  );
}

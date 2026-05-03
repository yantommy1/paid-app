"use client";

import { useEffect, useState } from "react";

type RoiSummary = {
  recoveredAllTime: number;
  recoveredThisMonth: number;
  invoicesRecoveredCount: number;
  avgDaysFromReminderToPayment: number | null;
  remindersQueuedNow: number;
};

function fmtUSD(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function DashboardROIHero() {
  const [data, setData] = useState<RoiSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/roi")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: RoiSummary | null) => {
        if (cancelled) return;
        setData(j);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="border border-[#E5E5E5] bg-[#F0F7F4] px-8 py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Loading…</p>
      </section>
    );
  }

  const recovered = data?.recoveredAllTime ?? 0;
  const month = data?.recoveredThisMonth ?? 0;
  const count = data?.invoicesRecoveredCount ?? 0;
  const avg = data?.avgDaysFromReminderToPayment ?? null;
  const queued = data?.remindersQueuedNow ?? 0;

  // Empty state — nudge the user to send their first reminder.
  if (recovered === 0 && count === 0) {
    return (
      <section className="border border-[#E5E5E5] bg-[#F0F7F4] px-8 py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-[#1B4332]">Your collections team</p>
        <h2 className="mt-2 font-display text-3xl text-[#0D0D0D]">Ready when you are.</h2>
        <p className="mt-3 max-w-2xl text-sm text-[#6B6B6B]">
          {queued > 0
            ? `${queued} reminder${queued === 1 ? "" : "s"} drafted and waiting for your approval. Open the Gmail Add-On to review and send.`
            : "Once you connect QuickBooks, Paid will draft a reminder for every overdue invoice. Approve them in Gmail with one click — we never auto-send."}
        </p>
      </section>
    );
  }

  return (
    <section className="border border-[#E5E5E5] bg-[#F0F7F4] px-8 py-10">
      <p className="text-xs uppercase tracking-[0.18em] text-[#1B4332]">Your collections team</p>
      <h2 className="mt-2 font-display text-4xl text-[#0D0D0D] sm:text-5xl">
        We&apos;ve recovered <span className="text-[#1B4332]">${fmtUSD(recovered)}</span> for you.
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="border border-[#E5E5E5] bg-white px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">This month</p>
          <p className="mt-2 font-display text-2xl text-[#0D0D0D]">${fmtUSD(month)}</p>
        </article>
        <article className="border border-[#E5E5E5] bg-white px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">Invoices recovered</p>
          <p className="mt-2 font-display text-2xl text-[#0D0D0D]">{count}</p>
        </article>
        <article className="border border-[#E5E5E5] bg-white px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">Avg. reminder → paid</p>
          <p className="mt-2 font-display text-2xl text-[#0D0D0D]">
            {avg !== null ? `${avg} days` : "—"}
          </p>
        </article>
        <article className="border border-[#E5E5E5] bg-white px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">Drafts waiting</p>
          <p className="mt-2 font-display text-2xl text-[#0D0D0D]">{queued}</p>
        </article>
      </div>
    </section>
  );
}

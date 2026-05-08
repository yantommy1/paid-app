"use client";

import { useEffect, useState } from "react";

type RecentReply = {
  id: string;
  invoiceId: string | null;
  classification: string;
  promisedPayDate: string | null;
  excerpt: string | null;
  suggestedAction: string | null;
  createdAt: string;
  clientEmail: string | null;
  threadId: string | null;
  invoice: {
    client_name: string;
    client_email: string;
    amount: number;
    days_overdue: number;
    quickbooks_invoice_id: string;
    status: string;
  } | null;
  nextFollowup: string | null;
};

const CLASSIFICATION_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  will_pay_later: { label: "Will pay later", tone: "warn" },
  cannot_pay: { label: "Can't pay", tone: "bad" },
  payment_plan_request: { label: "Asked for plan", tone: "warn" },
  invoice_issue: { label: "Disputes invoice", tone: "bad" },
  thank_you: { label: "Acknowledged", tone: "ok" },
  paid: { label: "Confirmed paid", tone: "ok" },
  other: { label: "Reply", tone: "neutral" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

/**
 * Surfaces inbound client replies the add-on has classified, on the web
 * dashboard. Otherwise the only place to see "the client said they can't
 * pay" was inside Gmail — losing the dashboard as a place to triage.
 *
 * Empty-state copy aims for "no nags" — we don't say "no replies yet" if
 * the user has no invoices at all.
 */
export function DashboardRecentReplies() {
  const [items, setItems] = useState<RecentReply[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/replies/recent")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { items?: RecentReply[] }) => {
        if (cancelled) return;
        setItems(j.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load replies");
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <section className="mt-10 border border-[#E5E5E5] bg-white px-6 py-6">
        <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Loading replies…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-10 border border-[#E5E5E5] bg-white px-6 py-6">
        <p className="text-xs uppercase tracking-[0.18em] text-red-600">{error}</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mt-10 border border-[#E5E5E5] bg-white px-6 py-6">
        <h3 className="font-display text-xl text-[#0D0D0D]">Recent replies</h3>
        <p className="mt-2 text-sm text-[#6B6B6B]">
          No client replies in the last 30 days. When clients respond to a Paid reminder,
          we&apos;ll classify the reply (will pay later / can&apos;t pay / payment plan / dispute)
          and surface it here.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 border border-[#E5E5E5] bg-white px-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-xl text-[#0D0D0D]">Recent replies</h3>
        <span className="text-xs text-[#6B6B6B]">{items.length} in the last 30 days</span>
      </div>

      <ul className="mt-4 divide-y divide-[#E5E5E5] border-t border-[#E5E5E5]">
        {items.map((r) => {
          const meta =
            CLASSIFICATION_LABELS[r.classification] ??
            CLASSIFICATION_LABELS.other;
          const toneClass =
            meta.tone === "ok"
              ? "bg-[#1B4332] text-white"
              : meta.tone === "bad"
                ? "bg-red-600 text-white"
                : meta.tone === "warn"
                  ? "bg-amber-500 text-white"
                  : "bg-[#E5E5E5] text-[#0D0D0D]";
          return (
            <li key={r.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium ${toneClass}`}>
                      {meta.label}
                    </span>
                    <p className="font-mono text-xs text-[#0D0D0D]">
                      {r.invoice?.client_name ?? r.clientEmail ?? "Unknown"}
                    </p>
                    {r.invoice && (
                      <span className="font-mono text-xs text-[#6B6B6B]">
                        {fmtUSD(r.invoice.amount)} · {r.invoice.days_overdue}d overdue
                      </span>
                    )}
                    <span className="text-xs text-[#6B6B6B]">{relTime(r.createdAt)}</span>
                  </div>
                  {r.excerpt && (
                    <p className="mt-2 line-clamp-2 text-sm italic text-[#6B6B6B]">
                      &ldquo;{r.excerpt}&rdquo;
                    </p>
                  )}
                  {r.promisedPayDate && (
                    <p className="mt-2 text-xs text-[#1B4332]">
                      Promised pay date: {fmtDate(r.promisedPayDate)}
                    </p>
                  )}
                  {r.nextFollowup && (
                    <p className="mt-1 text-xs text-[#6B6B6B]">
                      Next follow-up scheduled: {fmtDate(r.nextFollowup)}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

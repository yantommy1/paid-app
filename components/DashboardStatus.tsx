"use client";

import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SummaryJson = {
  header?: { totalOutstanding: number };
  overdueInvoiceCount?: number;
  lastSyncedAt?: string | null;
  error?: string;
};

function formatMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSynced(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function DashboardStatus() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/summary");
      const j = (await res.json()) as SummaryJson;
      if (!res.ok) {
        setError(
          typeof j.error === "string" ? j.error : "Could not load summary."
        );
        return;
      }
      setTotal(j.header?.totalOutstanding ?? 0);
      setOverdueCount(j.overdueInvoiceCount ?? 0);
      setLastSync(j.lastSyncedAt ?? null);
    } catch {
      setError("Could not load summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/sync", { method: "POST" });
      const j = (await res.json()) as {
        error?: string;
        lastSyncedAt?: string;
      };
      if (!res.ok) {
        const raw = typeof j.error === "string" ? j.error : "";
        if (
          /quickbooks not connected|quickbooks token invalid|reconnect/i.test(
            raw
          )
        ) {
          setError("Reconnect QuickBooks in Settings to sync invoices.");
        } else {
          setError(raw || "Sync failed. Try again.");
        }
        return;
      }
      if (j.lastSyncedAt) setLastSync(j.lastSyncedAt);
      await load();
    } catch {
      setError("Sync failed. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-paid-ink px-6 py-10 text-paid-mist">
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight transition hover:text-[#00E5A0]"
          >
            Paid
          </Link>
          <nav className="flex flex-wrap items-center gap-6">
            <Link
              href="/settings"
              className="text-sm font-medium text-paid-mist/75 transition hover:text-[#00E5A0]"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm font-medium text-paid-mist/75 transition hover:text-[#00E5A0]"
            >
              Sign out
            </button>
          </nav>
        </header>

        <div className="rounded-xl border border-white/[0.1] bg-white/[0.02] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.25)] md:p-10">
          <h1 className="text-center font-display text-3xl tracking-tight text-paid-mist md:text-[2rem]">
            You&apos;re all set.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-paid-mist/55">
            Paid is working in the background. Your Gmail Add-On surfaces
            overdue invoices right where you work.
          </p>

          <div className="mt-8 flex justify-center">
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full max-w-sm items-center justify-center rounded-lg bg-[#00E5A0] px-6 py-3.5 text-sm font-semibold text-paid-ink transition hover:brightness-110 sm:w-auto"
            >
              Open Gmail
            </a>
          </div>

          <div className="mt-10 border-t border-white/[0.08] pt-8">
            {loading ? (
              <p className="text-center text-sm text-paid-mist/45">
                Loading summary…
              </p>
            ) : (
              <dl className="grid gap-6 text-center sm:grid-cols-3 sm:gap-4">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-white/35">
                    Total outstanding
                  </dt>
                  <dd className="mt-1 font-mono text-lg tabular-nums text-paid-mist">
                    ${total != null ? formatMoney(total) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-white/35">
                    Overdue invoices
                  </dt>
                  <dd className="mt-1 font-mono text-lg tabular-nums text-paid-mist">
                    {overdueCount != null ? overdueCount : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-white/35">
                    Last synced
                  </dt>
                  <dd className="mt-1 text-sm tabular-nums text-paid-mist/80">
                    {formatSynced(lastSync)}
                  </dd>
                </div>
              </dl>
            )}

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                disabled={syncing || loading}
                onClick={() => void syncNow()}
                className="text-sm font-medium text-[#00E5A0] underline-offset-4 transition hover:underline disabled:opacity-40"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-red-400/90" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

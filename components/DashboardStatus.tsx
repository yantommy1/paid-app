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
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSynced(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
        setError(typeof j.error === "string" ? j.error : "Could not load summary.");
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
      const j = (await res.json()) as { error?: string; lastSyncedAt?: string };
      if (!res.ok) {
        const raw = typeof j.error === "string" ? j.error : "";
        if (/quickbooks not connected|quickbooks token invalid|reconnect/i.test(raw)) {
          setError("Reconnect QuickBooks in Settings to sync invoices.");
        } else {
          setError(raw || "Sync failed. Try again.");
        }
        return;
      }
      setLastSync(j.lastSyncedAt ?? new Date().toISOString());
      await load();
    } catch {
      setError("Sync failed. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-white px-6 py-10 text-[#0D0D0D]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E5E5] pb-6">
          <Link href="/" className="font-display text-3xl text-[#0D0D0D]">Paid</Link>
          <nav className="flex flex-wrap items-center gap-6">
            <Link href="/settings" className="text-sm text-[#0D0D0D]">Settings</Link>
            <button type="button" onClick={() => void signOut()} className="text-sm text-[#0D0D0D]">Sign out</button>
          </nav>
        </header>

        <div className="mx-auto w-full max-w-[720px] border border-[#E5E5E5] bg-white p-10 shadow-sm">
          <h1 className="text-center font-display text-5xl text-[#0D0D0D]">You&apos;re all set.</h1>
          <p className="mx-auto mt-4 max-w-lg text-center text-base leading-relaxed text-[#6B6B6B]">
            Paid is working in the background. Your Gmail Add-On surfaces overdue invoices right where you work.
          </p>

          <div className="mt-8 flex justify-center">
            <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" className="bg-black px-6 py-3 text-sm font-medium text-white">
              Open Gmail
            </a>
          </div>

          <div className="mt-10 border-t border-[#E5E5E5] pt-8">
            {loading ? (
              <p className="text-center text-sm text-[#6B6B6B]">Loading summary...</p>
            ) : (
              <dl className="grid gap-6 text-center sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-[#6B6B6B]">Total outstanding</dt>
                  <dd className="mt-2 font-display text-3xl">${total != null ? formatMoney(total) : "-"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-[#6B6B6B]">Overdue invoices</dt>
                  <dd className="mt-2 font-display text-3xl">{overdueCount != null ? overdueCount : "-"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-[#6B6B6B]">Last synced</dt>
                  <dd className="mt-2 text-sm text-[#6B6B6B]">{formatSynced(lastSync)}</dd>
                </div>
              </dl>
            )}

            <div className="mt-6 text-center">
              <button type="button" disabled={syncing || loading} onClick={() => void syncNow()} className="text-sm text-[#1B4332] underline disabled:opacity-50">
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            </div>

            {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

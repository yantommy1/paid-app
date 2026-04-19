"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SyncJson = {
  ok?: boolean;
  upserted?: number;
  overdueCount?: number;
  error?: unknown;
};

type Props = {
  /** Run one sync automatically when the component mounts (e.g. after Gmail OAuth). */
  autoSyncOnMount?: boolean;
};

export function SyncInvoicesSection({ autoSyncOnMount = false }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [upserted, setUpserted] = useState<number | null>(null);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoRan = useRef(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/sync", { method: "POST" });
      const j = (await res.json()) as SyncJson;
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : "Sync failed — check QuickBooks connection.";
        setError(msg);
        setUpserted(null);
        setOverdueCount(null);
        return;
      }
      setUpserted(typeof j.upserted === "number" ? j.upserted : null);
      setOverdueCount(typeof j.overdueCount === "number" ? j.overdueCount : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setUpserted(null);
      setOverdueCount(null);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!autoSyncOnMount || autoRan.current) return;
    autoRan.current = true;
    void sync();
  }, [autoSyncOnMount, sync]);

  return (
    <section className="rounded-xl border border-paid-brand/30 bg-paid-brand/5 p-6">
      <h3 className="text-lg font-semibold text-slate-900">QuickBooks invoice sync</h3>
      <p className="mt-2 text-sm text-slate-600">
        Pull unpaid invoices from QuickBooks into Paid. Uses your connected QuickBooks
        account — no need to wait for the daily job.
      </p>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={syncing}
        className="mt-4 rounded-lg bg-paid-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {syncing ? "Syncing…" : "Sync Invoices"}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {upserted !== null && overdueCount !== null && !error && (
        <p className="mt-3 text-sm text-slate-800">
          Synced <strong>{upserted}</strong> invoice{upserted === 1 ? "" : "s"}.{" "}
          <strong>{overdueCount}</strong> currently overdue.
        </p>
      )}
    </section>
  );
}

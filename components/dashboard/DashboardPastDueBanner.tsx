"use client";

import { useState } from "react";

export function DashboardPastDueBanner() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST", credentials: "include" });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setErr(typeof j.error === "string" ? j.error : "Could not open billing portal.");
        return;
      }
      window.location.href = j.url;
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        Your subscription payment failed. Update your payment method to avoid losing access.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void openPortal()}
        className="mt-2 text-sm font-semibold text-[#1B4332] underline disabled:opacity-50"
      >
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}

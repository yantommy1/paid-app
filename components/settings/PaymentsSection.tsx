"use client";

import { useEffect, useState } from "react";

type Status = {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingUrl: string | null;
};

type SettingsState = {
  accept_card: boolean;
  accept_ach: boolean;
  quickbooks_auto_record_payments: boolean;
};

const DEFAULTS: SettingsState = {
  accept_card: true,
  accept_ach: true,
  quickbooks_auto_record_payments: true,
};

export function PaymentsSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<SettingsState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/stripe/connect/status").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statusJson, settingsJson]) => {
        if (cancelled) return;
        if (statusJson) {
          setStatus({
            connected: Boolean(statusJson.connected),
            chargesEnabled: Boolean(statusJson.chargesEnabled),
            payoutsEnabled: Boolean(statusJson.payoutsEnabled),
            onboardingUrl: statusJson.onboardingUrl ?? null,
          });
        }
        const s = settingsJson?.settings ?? null;
        if (s) {
          setState({
            accept_card: s.accept_card ?? true,
            accept_ach: s.accept_ach ?? true,
            quickbooks_auto_record_payments: s.quickbooks_auto_record_payments ?? true,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePrefs() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMessage(j.error ?? "Could not save.");
      } else {
        setMessage("Saved.");
      }
    } catch {
      setMessage("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function startConnect() {
    if (status?.onboardingUrl) {
      window.location.href = status.onboardingUrl;
    }
  }

  if (loading) {
    return (
      <section className="border-t border-[#E5E5E5] py-10">
        <p className="text-sm text-[#6B6B6B]">Loading payment settings…</p>
      </section>
    );
  }

  return (
    <section className="border-t border-[#E5E5E5] py-10">
      <h2 className="font-display text-2xl text-[#0D0D0D]">Payments</h2>
      <p className="mt-2 text-sm text-[#6B6B6B]">
        Stripe Connect powers the Pay Now button on every reminder. Your clients never sign
        up for anything — they enter card or bank details on Stripe&rsquo;s hosted Checkout
        page. Only you onboard, once.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="border border-[#E5E5E5] bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Stripe Connect</p>
          {status?.connected ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#1B4332]" />
              <span className="text-sm font-medium text-[#1B4332]">Connected</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#C4863A]" />
              <span className="text-sm font-medium text-[#0D0D0D]">Not connected</span>
            </div>
          )}
          {status && !status.connected && (
            <p className="mt-2 text-xs text-[#6B6B6B]">
              {status.chargesEnabled
                ? "Onboarding partially complete. Finish to start receiving payouts."
                : "About 5 minutes — Stripe will ask for your bank account and EIN."}
            </p>
          )}
          <div className="mt-4">
            {status?.connected ? (
              <button
                type="button"
                onClick={startConnect}
                className="border border-[#1B4332] px-4 py-2 text-sm text-[#1B4332]"
              >
                Re-verify with Stripe
              </button>
            ) : (
              <button
                type="button"
                onClick={startConnect}
                disabled={!status?.onboardingUrl}
                className="bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Connect Stripe
              </button>
            )}
          </div>
        </div>

        <div className="border border-[#E5E5E5] bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Accepted methods</p>
          <label className="mt-3 flex items-center gap-2 text-sm text-[#0D0D0D]">
            <input
              type="checkbox"
              checked={state.accept_card}
              onChange={(e) => setState({ ...state, accept_card: e.target.checked })}
            />
            Credit / debit card{" "}
            <span className="text-xs text-[#6B6B6B]">(2.9% + $0.30)</span>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm text-[#0D0D0D]">
            <input
              type="checkbox"
              checked={state.accept_ach}
              onChange={(e) => setState({ ...state, accept_ach: e.target.checked })}
            />
            ACH bank debit{" "}
            <span className="text-xs text-[#6B6B6B]">(0.8%, capped at $5)</span>
          </label>
          <p className="mt-3 text-xs text-[#6B6B6B]">
            ACH saves real money on $5k+ invoices. We recommend keeping both on.
          </p>

          <div className="mt-6 border-t border-[#E5E5E5] pt-4">
            <label className="flex items-center gap-2 text-sm text-[#0D0D0D]">
              <input
                type="checkbox"
                checked={state.quickbooks_auto_record_payments}
                onChange={(e) =>
                  setState({ ...state, quickbooks_auto_record_payments: e.target.checked })
                }
              />
              Automatically record payments in QuickBooks
            </label>
            <p className="mt-2 text-xs text-[#6B6B6B]">
              When a Stripe payment lands, Paid creates a matching Payment record in
              QuickBooks and closes the invoice for you.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void savePrefs()}
              disabled={busy}
              className="bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {message && <span className="text-sm text-[#6B6B6B]">{message}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

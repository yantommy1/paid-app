"use client";

import { useEffect, useState } from "react";

type SettingsState = {
  tone_default: "friendly" | "professional" | "firm";
  tone_auto_adjust: boolean;
  payment_link_enabled: boolean;
  early_pay_discount_pct: number;
  early_pay_discount_days: number;
  payment_plan_enabled: boolean;
  payment_plan_installments: number;
  pay_now_button_label: string;
};

const DEFAULTS: SettingsState = {
  tone_default: "professional",
  tone_auto_adjust: true,
  payment_link_enabled: true,
  early_pay_discount_pct: 0,
  early_pay_discount_days: 7,
  payment_plan_enabled: false,
  payment_plan_installments: 3,
  pay_now_button_label: "Pay invoice online",
};

export function ReminderPreferencesSection() {
  const [state, setState] = useState<SettingsState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { settings?: Partial<SettingsState> | null } | null) => {
        if (cancelled) return;
        const s = j?.settings ?? null;
        if (s) {
          setState({
            tone_default: (s.tone_default as SettingsState["tone_default"]) ?? "professional",
            tone_auto_adjust: s.tone_auto_adjust ?? true,
            payment_link_enabled: s.payment_link_enabled ?? true,
            early_pay_discount_pct: Number(s.early_pay_discount_pct ?? 0),
            early_pay_discount_days: Number(s.early_pay_discount_days ?? 7),
            payment_plan_enabled: s.payment_plan_enabled ?? false,
            payment_plan_installments: Number(s.payment_plan_installments ?? 3),
            pay_now_button_label: s.pay_now_button_label ?? "Pay invoice online",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone_default: state.tone_default,
          tone_auto_adjust: state.tone_auto_adjust,
          payment_link_enabled: state.payment_link_enabled,
          early_pay_discount_pct: state.early_pay_discount_pct,
          early_pay_discount_days: state.early_pay_discount_days,
          payment_plan_enabled: state.payment_plan_enabled,
          payment_plan_installments: state.payment_plan_installments,
          pay_now_button_label: state.pay_now_button_label,
        }),
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
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="border-t border-[#E5E5E5] py-10">
        <p className="text-sm text-[#6B6B6B]">Loading reminder preferences…</p>
      </section>
    );
  }

  return (
    <section className="border-t border-[#E5E5E5] py-10">
      <h2 className="font-display text-2xl text-[#0D0D0D]">Reminder preferences</h2>
      <p className="mt-2 text-sm text-[#6B6B6B]">
        Defaults for every reminder Paid drafts. You can override these per invoice in the Gmail Add-On.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Default tone</label>
          <div className="mt-2 inline-flex border border-[#E5E5E5]">
            {(["friendly", "professional", "firm"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setState({ ...state, tone_default: t })}
                className={`px-4 py-2 text-sm capitalize ${
                  state.tone_default === t
                    ? "bg-[#1B4332] text-white"
                    : "bg-white text-[#0D0D0D] hover:bg-[#F7F7F5]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-[#0D0D0D]">
            <input
              type="checkbox"
              checked={state.tone_auto_adjust}
              onChange={(e) => setState({ ...state, tone_auto_adjust: e.target.checked })}
            />
            Auto-adjust by client history and invoice size
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-[#0D0D0D]">
            <input
              type="checkbox"
              checked={state.payment_link_enabled}
              onChange={(e) => setState({ ...state, payment_link_enabled: e.target.checked })}
            />
            Include a Pay Now button on every reminder
          </label>
          <p className="mt-2 text-xs text-[#6B6B6B]">
            <strong className="text-[#0D0D0D]">Your clients never sign up for anything.</strong>{" "}
            Stripe Checkout is a hosted page — they enter card or bank details and they&apos;re done in 30 seconds.
            Only you onboard once to Stripe Connect (~5 minutes) so you can receive payouts to your bank account.
          </p>
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Pay Now button label</label>
            <input
              type="text"
              value={state.pay_now_button_label}
              onChange={(e) => setState({ ...state, pay_now_button_label: e.target.value })}
              className="mt-2 block w-full border border-[#E5E5E5] px-3 py-2 text-sm"
              maxLength={64}
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Early-pay discount (%)</label>
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={state.early_pay_discount_pct}
            onChange={(e) =>
              setState({ ...state, early_pay_discount_pct: Number(e.target.value || 0) })
            }
            className="mt-2 block w-32 border border-[#E5E5E5] px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-[#6B6B6B]">Set to 0 to disable. Applies if the client clicks Pay Now within the discount window below.</p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Discount window (days)</label>
          <input
            type="number"
            min={1}
            max={60}
            step={1}
            value={state.early_pay_discount_days}
            onChange={(e) =>
              setState({ ...state, early_pay_discount_days: Number(e.target.value || 7) })
            }
            className="mt-2 block w-32 border border-[#E5E5E5] px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-[#6B6B6B]">Counted from the time the reminder was sent.</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-[#0D0D0D]">
            <input
              type="checkbox"
              checked={state.payment_plan_enabled}
              onChange={(e) => setState({ ...state, payment_plan_enabled: e.target.checked })}
            />
            Offer a payment plan link
          </label>
          <p className="mt-2 text-xs text-[#6B6B6B]">
            Adds a second link to the email so a client who can&apos;t pay all at once can request a multi-month plan.
          </p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Default plan length (months)</label>
          <input
            type="number"
            min={2}
            max={12}
            step={1}
            value={state.payment_plan_installments}
            onChange={(e) =>
              setState({ ...state, payment_plan_installments: Number(e.target.value || 3) })
            }
            className="mt-2 block w-32 border border-[#E5E5E5] px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="bg-[#1B4332] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {message && <span className="text-sm text-[#6B6B6B]">{message}</span>}
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useId, useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  priceId: string;
  plan: "starter" | "pro";
  initialEmail?: string | null;
  skipCapture?: boolean;
};

export function EmailCaptureModal({
  isOpen,
  onClose,
  priceId,
  plan,
  initialEmail,
  skipCapture = false,
}: Props) {
  const emailId = useId();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(initialEmail ?? "");
    setError(null);
  }, [isOpen, initialEmail]);

  const startCheckout = useCallback(async (checkoutEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: checkoutEmail,
          priceId,
          plan,
        }),
      });

      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not continue to payment.");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Could not continue to payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [plan, priceId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Please enter your email.");
      return;
    }
    await startCheckout(normalized);
  }

  useEffect(() => {
    if (!isOpen || !skipCapture || !initialEmail) return;
    void startCheckout(initialEmail.trim().toLowerCase());
  }, [isOpen, skipCapture, initialEmail, startCheckout]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D0D0D]/30 px-4">
      <div className="w-full max-w-md border border-[#E5E5E5] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-display text-3xl text-[#0D0D0D]">Start your free trial</h2>
          <button type="button" className="text-sm text-[#6B6B6B]" onClick={onClose}>
            Close
          </button>
        </div>

        {!skipCapture && (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor={emailId} className="mb-1 block text-sm text-[#6B6B6B]">
                Work email
              </label>
              <input
                id={emailId}
                type="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                placeholder="you@firm.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B4332] py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Continuing..." : "Continue to payment"}
            </button>
          </form>
        )}

        {skipCapture && (
          <div className="py-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => initialEmail && void startCheckout(initialEmail)}
              className="w-full bg-[#1B4332] py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Continuing..." : "Continue to payment"}
            </button>
          </div>
        )}

        <p className="mt-4 text-xs text-[#6B6B6B]">
          30-day free trial. Cancel anytime before day 31.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

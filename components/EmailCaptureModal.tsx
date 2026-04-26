"use client";

import { mapAuthError } from "@/components/LandingEmailForm";
import { createClient } from "@/lib/supabase/browser";
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
  const firstNameId = useId();
  const lastNameId = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [fallbackPassword, setFallbackPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(initialEmail ?? "");
    setFirstName("");
    setLastName("");
    setError(null);
  }, [isOpen, initialEmail]);

  const trialEndsDisplay = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  const startCheckout = useCallback(
    async (checkoutEmail: string, first?: string, last?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: checkoutEmail,
          fullName: [first?.trim(), last?.trim()].filter(Boolean).join(" ") || undefined,
          firstName: first?.trim() || undefined,
          lastName: last?.trim() || undefined,
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
    },
    [plan, priceId]
  );

  async function continueWithGoogle() {
    setAuthLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    /**
     * Developer note:
     * Enable Google OAuth in Supabase Authentication -> Providers.
     * Configure Google Client ID/Secret in Supabase and add redirect URIs:
     * - https://paid-app.com/auth/callback
     * - https://gpwtqfawepditozykjlo.supabase.co/auth/v1/callback
     */
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(mapAuthError(oauthError.message));
      setAuthLoading(false);
    }
  }

  async function fallbackEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !fallbackPassword.trim()) {
      setError("Enter email and password to continue.");
      return;
    }
    setAuthLoading(true);
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: fallbackPassword,
    });
    if (signInErr) {
      setError(mapAuthError(signInErr.message));
      setAuthLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Please enter your email.");
      return;
    }
    await startCheckout(normalized, firstName, lastName);
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
          <>
            <button
              type="button"
              disabled={authLoading || loading}
              onClick={() => void continueWithGoogle()}
              className="mb-4 flex w-full items-center justify-center gap-3 border border-[#0D0D0D] bg-white py-2.5 text-sm font-medium text-[#0D0D0D] disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.649 32.657 29.218 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.27 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.27 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.163 0 9.859-1.977 13.409-5.192l-6.19-5.238C29.157 35.091 26.687 36 24 36c-5.197 0-9.615-3.316-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 01-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Continue with Google
            </button>

            <div className="mb-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#E5E5E5]" />
              <span className="text-xs text-[#6B6B6B]">or</span>
              <span className="h-px flex-1 bg-[#E5E5E5]" />
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor={firstNameId} className="mb-1 block text-sm text-[#6B6B6B]">
                First name
              </label>
              <input
                id={firstNameId}
                type="text"
                value={firstName}
                required
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                placeholder="Tommy"
              />
            </div>
            <div>
              <label htmlFor={lastNameId} className="mb-1 block text-sm text-[#6B6B6B]">
                Last name
              </label>
              <input
                id={lastNameId}
                type="text"
                value={lastName}
                required
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                placeholder="Yan"
              />
            </div>
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

            <form className="mt-3 space-y-3" onSubmit={fallbackEmailAuth}>
              <label className="block text-xs text-[#6B6B6B]">Email + password fallback</label>
              <input
                type="password"
                value={fallbackPassword}
                onChange={(e) => setFallbackPassword(e.target.value)}
                className="w-full border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                placeholder="Password"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full border border-[#0D0D0D] bg-white py-2.5 text-sm font-medium text-[#0D0D0D] disabled:opacity-60"
              >
                Continue with email
              </button>
            </form>
          </>
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
          30-day free trial. Cancel anytime before {trialEndsDisplay}.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

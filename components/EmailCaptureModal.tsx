"use client";

import { mapAuthError } from "@/components/LandingEmailForm";
import { createClient } from "@/lib/supabase/browser";
import { useEffect, useState } from "react";

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
  plan: _plan,
  initialEmail,
  skipCapture = false,
}: Props) {
  void priceId;
  void initialEmail;
  void skipCapture;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
  }, [isOpen]);

  const trialEndsDisplay = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  async function continueWithGoogle() {
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // Developer must enable Google OAuth in Supabase -> Authentication -> Providers -> Google,
    // set Google Client ID/Secret, and add
    // https://gpwtqfawepditozykjlo.supabase.co/auth/v1/callback
    // to authorized redirect URIs in Google Cloud Console.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(mapAuthError(oauthError.message));
    }
  }

  async function continueWithGoogleAndClose() {
    setError(null);
    await continueWithGoogle();
  }

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

        <button
          type="button"
          onClick={() => void continueWithGoogleAndClose()}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-[#E5E5E5] bg-white px-6 py-3 text-sm font-medium text-[#0D0D0D] transition hover:bg-[#F7F7F5]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p className="mt-4 text-xs text-[#6B6B6B]">
          30-day free trial. Cancel anytime before {trialEndsDisplay}.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

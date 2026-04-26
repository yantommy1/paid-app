"use client";

import { mapAuthError } from "@/components/LandingEmailForm";
import { savePendingPlan } from "@/lib/billing/pending-plan";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Plan = "starter" | "pro";

type Props = {
  open: boolean;
  onClose: () => void;
  plan: Plan;
  priceId: string;
  priceLabel: string;
};

export function SignupModal({ open, onClose, plan, priceId, priceLabel }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        setBusy(false);
        setMessage(mapAuthError(error.message));
        return;
      }
      if (!data.session) {
        setBusy(false);
        setMessage("Check your email to confirm your account, then sign in to continue.");
        setMode("signin");
        return;
      }
      savePendingPlan({ plan, priceId });
      router.push("/onboarding");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      setMessage(mapAuthError(error.message));
      return;
    }
    savePendingPlan({ plan, priceId });
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="Close modal"
      />
      <div className="relative z-10 w-full max-w-md border border-[#E5E5E5] bg-white p-7">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-sm text-[#6B6B6B] hover:text-[#0D0D0D]"
        >
          Close
        </button>
        <p className="font-display text-3xl text-[#0D0D0D]">Paid</p>
        <p className="mt-4 text-sm text-[#6B6B6B]">
          Starting your <span className="font-medium capitalize text-[#0D0D0D]">{plan}</span> plan
          {" - "}
          {priceLabel}
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-[#6B6B6B]" htmlFor="signup-email">
              Work email
            </label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
              placeholder="you@firm.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[#6B6B6B]" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
              placeholder="At least 6 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#1B4332] py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy
              ? "Working..."
              : mode === "signup"
                ? "Create account"
                : "Sign in and continue"}
          </button>
          {message && <p className="text-sm text-red-600">{message}</p>}
        </form>

        <p className="mt-5 text-sm text-[#6B6B6B]">
          {mode === "signup" ? "Already have an account?" : "Need a new account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signup" ? "signin" : "signup"));
              setMessage(null);
            }}
            className="text-[#1B4332] underline"
          >
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </p>
      </div>
    </div>
  );
}

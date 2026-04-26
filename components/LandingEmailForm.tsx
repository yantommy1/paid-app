"use client";

import { createClient } from "@/lib/supabase/browser";
import { postLoginPathForState } from "@/lib/auth/post-login-path";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export type AuthIntent = "signup" | "signin";
type Variant = "light" | "dark";

type Props = {
  variant?: Variant;
  intent?: AuthIntent;
};

export function mapAuthError(raw: string | undefined): string {
  if (!raw) return "Something went wrong. Please try again.";
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Invalid email or password.";
  }
  if (lower.includes("user already registered")) {
    return "This email already has an account. Sign in instead.";
  }
  if (lower.includes("user not found")) {
    return "No account found for this email.";
  }
  if (raw.length > 200) return "Could not complete the request. Try again.";
  return raw;
}

async function redirectAfterSession(router: ReturnType<typeof useRouter>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed, subscription_status")
    .eq("id", user.id)
    .maybeSingle();
  router.push(
    postLoginPathForState({
      onboardingCompleted: profile?.onboarding_completed === true,
      subscriptionStatus: (profile?.subscription_status as string | null) ?? null,
    })
  );
  router.refresh();
}

export function LandingEmailForm({ variant = "light", intent = "signup" }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const emailFieldId = useId();
  const passwordFieldId = useId();

  const isLight = variant === "light";
  const inputClass = isLight
    ? "w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
    : "w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]";

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    if (!password.trim()) {
      setStatus("error");
      setMessage("Enter a password.");
      return;
    }

    try {
      if (intent === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setStatus("error");
          setMessage(mapAuthError(error.message));
          return;
        }
        if (data.session) {
          await redirectAfterSession(router);
          return;
        }
        setStatus("sent");
        setMessage("Account created. Continue with Google next time for one-click sign-in.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus("error");
        setMessage(mapAuthError(error.message));
        return;
      }
      await redirectAfterSession(router);
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      setStatus("error");
      setMessage("Enter your email first, then request a reset link.");
      return;
    }
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/reset-password`,
    });
    if (error) {
      setStatus("error");
      setMessage(mapAuthError(error.message));
      return;
    }
    setStatus("sent");
    setMessage("Password reset email sent. Check your inbox.");
  }

  async function signInWithGoogle() {
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    /**
     * Requires Google provider enabled in Supabase Authentication.
     * Also configure Google OAuth Client ID/Secret in Supabase and add redirect URIs:
     * - https://paid-app.com/auth/callback
     * - https://gpwtqfawepditozykjlo.supabase.co/auth/v1/callback
     */
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(mapAuthError(error.message));
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={status === "loading"}
        onClick={() => void signInWithGoogle()}
        className="flex w-full items-center justify-center gap-3 border border-[#0D0D0D] bg-white py-2.5 text-sm font-medium text-[#0D0D0D] disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.649 32.657 29.218 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.27 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.27 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
          <path fill="#4CAF50" d="M24 44c5.163 0 9.859-1.977 13.409-5.192l-6.19-5.238C29.157 35.091 26.687 36 24 36c-5.197 0-9.615-3.316-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 01-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[#E5E5E5]" />
        <span className="text-xs text-[#6B6B6B]">or</span>
        <span className="h-px flex-1 bg-[#E5E5E5]" />
      </div>

      <form onSubmit={onPasswordSubmit} className="space-y-4">
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full bg-[#1B4332] py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === "loading" ? "Working..." : intent === "signup" ? "Continue with email" : "Sign in with email"}
        </button>
        <div>
          <label htmlFor={emailFieldId} className="mb-1 block text-sm text-[#6B6B6B]">
            Work email
          </label>
          <input
            id={emailFieldId}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@firm.com"
          />
        </div>
        <div>
          <label htmlFor={passwordFieldId} className="mb-1 block text-sm text-[#6B6B6B]">
            Password
          </label>
          <input
            id={passwordFieldId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Password"
          />
          {intent === "signin" && (
            <button
              type="button"
              onClick={() => void requestPasswordReset()}
              className="mt-2 text-xs text-[#1B4332] underline"
            >
              Forgot password?
            </button>
          )}
        </div>
      </form>

      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-600" : "text-[#1B4332]"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

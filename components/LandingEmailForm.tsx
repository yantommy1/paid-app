"use client";

import { createClient } from "@/lib/supabase/browser";
import { postLoginPathForState } from "@/lib/auth/post-login-path";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export type AuthIntent = "signup" | "signin";
type Variant = "light" | "dark";
type AuthMode = "signinLink" | "password";

type Props = {
  variant?: Variant;
  intent?: AuthIntent;
};

function mapAuthError(raw: string | undefined): string {
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
  const [mode, setMode] = useState<AuthMode>("signinLink");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const emailFieldId = useId();
  const passwordFieldId = useId();

  const isLight = variant === "light";
  const inputClass = isLight
    ? "w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
    : "w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    if (mode === "password") {
      if (!password.trim()) {
        setStatus("error");
        setMessage("Enter a password.");
        return;
      }
      try {
        if (intent === "signup") {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${origin}/auth/callback` },
          });
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
          setMessage("Check your email to confirm your account.");
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
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        shouldCreateUser: intent === "signup",
      },
    });
    if (error) {
      setStatus("error");
      setMessage(mapAuthError(error.message));
      return;
    }
    setStatus("sent");
    setMessage(intent === "signup" ? "Check your inbox for your sign-in link." : "Sign-in link sent.");
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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex border-b border-[#E5E5E5]">
        <button
          type="button"
          className={`px-3 py-2 text-sm ${mode === "signinLink" ? "border-b-2 border-[#1B4332] text-[#0D0D0D]" : "text-[#6B6B6B]"}`}
          onClick={() => {
            setMode("signinLink");
            setStatus("idle");
            setMessage("");
          }}
        >
          Sign-in link
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm ${mode === "password" ? "border-b-2 border-[#1B4332] text-[#0D0D0D]" : "text-[#6B6B6B]"}`}
          onClick={() => {
            setMode("password");
            setStatus("idle");
            setMessage("");
          }}
        >
          Password
        </button>
      </div>

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

      {mode === "password" && (
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
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-[#1B4332] py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "loading"
          ? "Working..."
          : mode === "password"
            ? intent === "signup"
              ? "Create account"
              : "Sign in"
            : "Send me a link"}
      </button>

      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-600" : "text-[#1B4332]"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

"use client";

import { createClient } from "@/lib/supabase/browser";
import type { AuthError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type Variant = "light" | "dark";
export type AuthIntent = "signup" | "signin";

type AuthMode = "magic" | "password";

type Props = {
  variant?: Variant;
  intent?: AuthIntent;
};

function mapAuthError(err: AuthError | null): string {
  if (!err?.message?.trim()) {
    return "Something went wrong. Please try again.";
  }
  const m = err.message.trim();
  const lower = m.toLowerCase();
  // Never surface unrelated UI copy, API paths, or onboarding strings as auth errors.
  if (
    (lower.includes("install") && lower.includes("gmail")) ||
    lower.includes("gmail add-on") ||
    /\/api\//.test(m) ||
    /anthropic|api_key|\.env/i.test(m)
  ) {
    return "We could not send the link. Please try again in a moment, or use Password to sign in.";
  }
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Invalid email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email first, or use a magic link to sign in.";
  }
  if (lower.includes("user already registered")) {
    return "This email already has an account. Sign in instead.";
  }
  if (lower.includes("signups not allowed") || lower.includes("user not found")) {
    return "No account found for this email. Use the New to Paid tab, or try a magic link.";
  }
  if (m.length > 240) {
    return "Could not complete the request. Please try again.";
  }
  return m;
}

async function redirectAfterSession(router: ReturnType<typeof useRouter>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();
  const path = profile?.onboarding_completed ? "/dashboard" : "/onboarding";
  router.push(path);
  router.refresh();
}

export function LandingEmailForm({
  variant = "light",
  intent = "signup",
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("magic");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const emailFieldId = useId();
  const passwordFieldId = useId();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    if (authMode === "password") {
      if (!password.trim()) {
        setStatus("error");
        setMessage("Enter a password, or switch to Magic link.");
        return;
      }
      try {
        if (intent === "signup") {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${origin}/auth/callback`,
            },
          });
          if (error) {
            setStatus("error");
            setMessage(mapAuthError(error));
            return;
          }
          if (data.session) {
            setStatus("sent");
            setMessage("You are signed in.");
            await redirectAfterSession(router);
            return;
          }
          setStatus("sent");
          setMessage(
            "Check your inbox to confirm your email, then sign in with your password."
          );
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setStatus("error");
          setMessage(mapAuthError(error));
          return;
        }
        setStatus("sent");
        setMessage("Signed in successfully.");
        await redirectAfterSession(router);
      } catch {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
      return;
    }

    // Magic link
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        shouldCreateUser: intent === "signup",
      },
    });
    if (error) {
      setStatus("error");
      setMessage(mapAuthError(error));
      return;
    }
    setStatus("sent");
    setMessage(
      intent === "signup"
        ? "Check your inbox \u2014 we sent a link to get you started."
        : "Check your inbox \u2014 we sent you a sign-in link."
    );
  }

  const isDark = variant === "dark";
  const labelClass = isDark
    ? "mb-1.5 block text-sm font-medium text-paid-mist/70"
    : "mb-1 block text-sm font-medium";
  const inputClass = isDark
    ? "w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-paid-mist outline-none ring-0 placeholder:text-white/35 focus:border-[#00E5A0]/45 focus:ring-1 focus:ring-[#00E5A0]/25"
    : "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-paid-brand focus:ring-2";
  const buttonClass = isDark
    ? "w-full rounded-lg bg-[#00E5A0] py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110 disabled:opacity-60"
    : "w-full rounded-lg bg-paid-brand py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60";
  const messageClass = isDark
    ? status === "error"
      ? "text-sm text-red-400"
      : "text-sm text-[#00E5A0]/90"
    : `text-sm ${status === "error" ? "text-red-600" : "text-slate-600"}`;

  const submitLabel =
    status === "loading"
      ? "Working…"
      : authMode === "password"
        ? intent === "signup"
          ? "Create account"
          : "Sign in with password"
        : intent === "signup"
          ? "Continue with email link"
          : "Email me a sign-in link";

  const tabBtn = (active: boolean) =>
    isDark
      ? `flex-1 rounded px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-[#00E5A0]/15 text-[#00E5A0]"
            : "text-paid-mist/60 hover:text-paid-mist"
        }`
      : `flex-1 rounded px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-paid-brand/15 text-paid-brand"
            : "text-slate-600 hover:text-slate-900"
        }`;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div
        className={`flex flex-wrap gap-2 rounded-md border p-1 ${isDark ? "border-white/10" : "border-slate-200"}`}
      >
        <button
          type="button"
          className={tabBtn(authMode === "magic")}
          onClick={() => {
            setAuthMode("magic");
            setMessage("");
            setStatus("idle");
          }}
        >
          Magic link
        </button>
        <button
          type="button"
          className={tabBtn(authMode === "password")}
          onClick={() => {
            setAuthMode("password");
            setMessage("");
            setStatus("idle");
          }}
        >
          Password
        </button>
      </div>

      <p className={`text-xs ${isDark ? "text-paid-mist/50" : "text-slate-500"}`}>
        {authMode === "magic"
          ? "We will email you a one-time link \u2014 no password needed."
          : intent === "signup"
            ? "Choose a password for your account."
            : "Sign in with the password you created."}
      </p>

      <div>
        <label htmlFor={emailFieldId} className={labelClass}>
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
          autoComplete="email"
        />
      </div>

      {authMode === "password" && (
        <div>
          <label htmlFor={passwordFieldId} className={labelClass}>
            Password
          </label>
          <input
            id={passwordFieldId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
            autoComplete={
              intent === "signup" ? "new-password" : "current-password"
            }
          />
        </div>
      )}

      <button type="submit" disabled={status === "loading"} className={buttonClass}>
        {submitLabel}
      </button>

      {message && (
        <p className={messageClass} role={status === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}
    </form>
  );
}

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
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const emailId = useId();
  const passwordId = useId();
  const inputClass =
    variant === "light"
      ? "w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
      : "w-full border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]";

  async function signInWithGoogle() {
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // Developer must enable Google OAuth in Supabase -> Authentication -> Providers -> Google,
    // set Google Client ID/Secret, and add
    // https://gpwtqfawepditozykjlo.supabase.co/auth/v1/callback
    // to authorized redirect URIs in Google Cloud Console.
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

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    if (!email.trim() || !password.trim()) {
      setStatus("error");
      setMessage("Enter your email and password.");
      return;
    }
    try {
      if (intent === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
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
        setStatus("error");
        setMessage("Check your email to confirm your account, then sign in.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
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

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={status === "loading"}
        onClick={() => void signInWithGoogle()}
        className="w-full flex items-center justify-center gap-3 rounded-lg border border-[#E5E5E5] bg-white px-6 py-3 text-sm font-medium text-[#0D0D0D] transition hover:bg-[#F7F7F5] disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
          <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[#E5E5E5]" />
        <span className="text-xs text-[#6B6B6B]">or continue with email</span>
        <span className="h-px flex-1 bg-[#E5E5E5]" />
      </div>

      <form onSubmit={onPasswordSubmit} className="space-y-4">
        <div>
          <label htmlFor={emailId} className="mb-1 block text-sm text-[#6B6B6B]">
            Work email
          </label>
          <input
            id={emailId}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@firm.com"
          />
        </div>
        <div>
          <label htmlFor={passwordId} className="mb-1 block text-sm text-[#6B6B6B]">
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Password"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full bg-[#1B4332] py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === "loading" ? "Working..." : intent === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-600" : "text-[#1B4332]"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState } from "react";

type Variant = "light" | "dark";

export function LandingEmailForm({ variant = "light" }: { variant?: Variant }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Check your inbox for the magic link.");
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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@firm.com"
          autoComplete="email"
        />
      </div>
      <button type="submit" disabled={status === "loading"} className={buttonClass}>
        {status === "loading" ? "Sending link…" : "Continue with email"}
      </button>
      {message && <p className={messageClass}>{message}</p>}
    </form>
  );
}

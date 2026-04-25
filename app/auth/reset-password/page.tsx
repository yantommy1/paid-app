"use client";

import { createClient } from "@/lib/supabase/browser";
import type { AuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

function mapUpdatePasswordError(err: AuthError | null): string {
  if (!err?.message?.trim()) {
    return "Could not update your password. Try again.";
  }
  const m = err.message.trim();
  const lower = m.toLowerCase();
  if (lower.includes("password") && lower.includes("least")) {
    return "Password does not meet requirements. Use at least 6 characters.";
  }
  if (m.length > 200) {
    return "Could not update your password. Try again.";
  }
  return m;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const passwordId = useId();
  const [checkingLink, setCheckingLink] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const applySession = (session: { user: unknown } | null) => {
      if (cancelled) return;
      if (session?.user) {
        setCanReset(true);
        setCheckingLink(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session?.user) {
        applySession(session);
      }
    });

    const check = () => {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        applySession(session);
      });
    };

    check();
    const t0 = window.setTimeout(check, 0);
    const t1 = window.setTimeout(check, 400);
    const t2 = window.setTimeout(() => {
      if (cancelled) return;
      setCheckingLink(false);
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!cancelled && session?.user) {
          setCanReset(true);
        }
      });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setStatus("error");
      setMessage("Enter a new password.");
      return;
    }
    setStatus("loading");
    setMessage("");
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.updateUser({
        password: password.trim(),
      });
      if (error) {
        setStatus("error");
        setMessage(mapUpdatePasswordError(error));
        return;
      }
      setStatus("success");
      setMessage("Password updated. Taking you to your dashboard...");
      window.setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#0D0D0D] outline-none ring-0 placeholder:text-[#6B6B6B] focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332]/25";

  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-16">
        <Link
          href="/"
          className="font-display text-2xl tracking-tight text-[#0D0D0D] transition hover:text-[#1B4332]"
        >
          Paid
        </Link>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#6B6B6B]">
          Reset password
        </p>

        <div className="mt-12 rounded-xl border border-[#E5E5E5] bg-[#F7F7F5] p-8">
          {checkingLink ? (
            <p className="text-sm text-[#6B6B6B]">Confirming your reset link…</p>
          ) : !canReset ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-[#6B6B6B]">
                This password reset link is invalid or has expired. Request a
                new one from the sign-in page.
              </p>
              <Link
                href="/"
                className="inline-block text-sm font-medium text-[#1B4332] hover:underline"
              >
                Back to Paid
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <div>
                <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-[#6B6B6B]">
                  New password
                </label>
                <input
                  id={passwordId}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="New password"
                  autoComplete="new-password"
                  disabled={status === "loading" || status === "success"}
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading" || status === "success"}
                className="w-full rounded-lg bg-[#1B4332] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {status === "loading" ? "Working…" : "Set new password"}
              </button>
              {message && (
                <p
                  className={
                    status === "error"
                      ? "text-sm text-red-600"
                      : "text-sm text-[#1B4332]"
                  }
                  role={status === "error" ? "alert" : "status"}
                >
                  {message}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function computeOnboardingStep(quickbooksConnected: boolean, gmailConnected: boolean, initialStep?: string): number {
  let step = quickbooksConnected && gmailConnected ? 3 : quickbooksConnected ? 2 : 1;
  if (initialStep === "quickbooks-done" && quickbooksConnected) step = Math.max(step, 2);
  if (initialStep === "gmail-done" && quickbooksConnected && gmailConnected) step = Math.max(step, 3);
  return step;
}

function ConnectedPill() {
  return (
    <div className="mt-5 inline-flex items-center gap-2 rounded bg-[#1B4332] px-4 py-2 text-sm font-medium text-white">
      <span aria-hidden>✓</span>
      Connected
    </div>
  );
}

type Props = {
  initialStep?: string;
  email: string;
  quickbooksConnected: boolean;
  gmailConnected: boolean;
};

export function OnboardingClient({ initialStep, email, quickbooksConnected, gmailConnected }: Props) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [qbConn, setQbConn] = useState(quickbooksConnected);
  const [gmConn, setGmConn] = useState(gmailConnected);

  useEffect(() => {
    setQbConn(quickbooksConnected);
    setGmConn(gmailConnected);
  }, [quickbooksConnected, gmailConnected]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { quickbooksConnected?: boolean; gmailConnected?: boolean } | null) => {
        if (cancelled || !data) return;
        if (typeof data.quickbooksConnected === "boolean") setQbConn(data.quickbooksConnected);
        if (typeof data.gmailConnected === "boolean") setGmConn(data.gmailConnected);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const step = useMemo(() => computeOnboardingStep(qbConn, gmConn, initialStep), [qbConn, gmConn, initialStep]);
  const canFinishSetup = qbConn && gmConn;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  async function completeOnboarding() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setCompleteError(j.error ?? "Could not save progress.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setCompleteError("Something went wrong. Try again.");
    } finally {
      setCompleting(false);
    }
  }

  const card = "border border-[#E5E5E5] bg-white p-6";

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 border-b border-[#E5E5E5] pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/" className="font-display text-3xl text-[#0D0D0D]">Paid</Link>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Setup</p>
          <p className="mt-4 text-sm text-[#6B6B6B]">Signed in as {email}</p>
        </div>
        <button type="button" onClick={() => void signOut()} className="border border-black px-4 py-2 text-sm text-black">Sign out</button>
      </header>

      <ol className="space-y-6">
        <li className={`${card} border-l-4 ${step >= 1 ? "border-l-[#1B4332]" : "border-l-transparent"}`}>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#1B4332]">Step 1</span>
          <h2 className="mt-2 font-display text-2xl">Connect QuickBooks</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">Authorize read access to unpaid invoices.</p>
          {qbConn ? (
            <ConnectedPill />
          ) : (
            <a href="/api/auth/quickbooks" className="mt-5 inline-block bg-[#1B4332] px-4 py-2.5 text-sm text-white">Connect QuickBooks</a>
          )}
        </li>

        <li className={`${card} border-l-4 ${step >= 2 ? "border-l-[#1B4332]" : "border-l-transparent"}`}>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#1B4332]">Step 2</span>
          <h2 className="mt-2 font-display text-2xl">Connect Gmail</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">Allow Paid to send reminders from your Gmail address.</p>
          {gmConn ? (
            <ConnectedPill />
          ) : (
            <a href="/api/auth/gmail" className="mt-5 inline-block bg-[#1B4332] px-4 py-2.5 text-sm text-white">Connect Gmail</a>
          )}
        </li>

        <li className={`${card} border-l-4 ${step >= 3 ? "border-l-[#1B4332]" : "border-l-transparent"}`}>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#1B4332]">Step 3</span>
          <h2 className="mt-2 font-display text-2xl">Install the Gmail Add-On</h2>
          <p className="mt-4 text-sm leading-relaxed text-[#6B6B6B]">
            Open Gmail, find the Paid icon in the right sidebar, then enter your API base URL and connection key.
          </p>
          <button
            type="button"
            className="mt-4 bg-[#1B4332] px-4 py-2.5 text-sm text-white"
            onClick={async () => {
              const res = await fetch("/api/auth/api-key", { method: "POST" });
              const j = (await res.json()) as { api_key?: string; error?: string };
              if (res.ok && j.api_key) {
                try {
                  await navigator.clipboard.writeText(j.api_key);
                } catch {
                  // ignore
                }
                window.alert("Connection key copied.");
              } else {
                window.alert(j.error ?? "Could not create a key.");
              }
            }}
          >
            Generate and copy key
          </button>

          <div className="mt-10 border-t border-[#E5E5E5] pt-8">
            {canFinishSetup ? (
              <>
                <p className="text-sm text-[#6B6B6B]">When you are ready, continue to your dashboard.</p>
                <button
                  type="button"
                  disabled={completing}
                  onClick={() => void completeOnboarding()}
                  className="mt-4 border border-[#1B4332] bg-[#1B4332] px-5 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {completing ? "Saving..." : "Go to dashboard"}
                </button>
                {completeError && <p className="mt-2 text-sm text-red-600">{completeError}</p>}
              </>
            ) : (
              <p className="text-sm text-[#6B6B6B]">Connect QuickBooks and Gmail above to continue.</p>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

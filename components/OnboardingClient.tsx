"use client";

import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function ConnectedPill() {
  return (
    <div
      className="mt-5 inline-flex cursor-default items-center gap-2 rounded-lg border border-[#00E5A0]/35 bg-[#00E5A0]/10 px-4 py-2.5 text-sm font-semibold text-[#00E5A0]"
      role="status"
      aria-label="Connected"
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M13.5 4.5L6.5 11.5L2.5 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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

export function OnboardingClient({
  initialStep,
  email,
  quickbooksConnected,
  gmailConnected,
}: Props) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const step =
    initialStep === "quickbooks-done"
      ? 2
      : initialStep === "gmail-done"
        ? 3
        : 1;

  const canFinishSetup = quickbooksConnected && gmailConnected;

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

  const card = (active: boolean) =>
    `rounded-xl border p-6 transition ${
      active
        ? "border-[#00E5A0]/45 bg-white/[0.03]"
        : "border-white/[0.1] bg-white/[0.01]"
    }`;

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 border-b border-white/[0.08] pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-paid-mist transition hover:text-[#00E5A0]"
          >
            Paid
          </Link>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            Setup
          </p>
          <p className="mt-4 text-sm text-paid-mist/55">Signed in as {email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="shrink-0 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0]"
        >
          Sign out
        </button>
      </header>

      <ol className="space-y-6">
        <li className={card(step >= 1)}>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#00E5A0]/80">
            Step 1
          </span>
          <h2 className="mt-2 font-display text-xl text-paid-mist">
            Connect QuickBooks
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-paid-mist/65">
            Authorize read access to unpaid invoices. We sync your open balances
            securely.
          </p>
          {quickbooksConnected ? (
            <ConnectedPill />
          ) : (
            <a
              href="/api/auth/quickbooks"
              className="mt-5 inline-block rounded-lg bg-[#00E5A0] px-4 py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110"
            >
              Connect QuickBooks
            </a>
          )}
        </li>

        <li className={card(step >= 2)}>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#00E5A0]/80">
            Step 2
          </span>
          <h2 className="mt-2 font-display text-xl text-paid-mist">
            Connect Gmail
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-paid-mist/65">
            Allow Paid to send reminders from your work Gmail address.
          </p>
          {gmailConnected ? (
            <ConnectedPill />
          ) : (
            <a
              href="/api/auth/gmail"
              className="mt-5 inline-block rounded-lg bg-[#00E5A0] px-4 py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110"
            >
              Connect Gmail
            </a>
          )}
        </li>

        <li className={card(step >= 3)}>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#00E5A0]/80">
            Step 3
          </span>
          <h2 className="mt-2 font-display text-xl text-paid-mist">
            Install the Gmail Add-On
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-paid-mist/75">
            Open Gmail{" "}
            <span className="text-paid-mist/50" aria-hidden>
              →
            </span>{" "}
            look for the Paid icon in the right sidebar{" "}
            <span className="text-paid-mist/50" aria-hidden>
              →
            </span>{" "}
            enter your API base URL (
            <span className="font-mono text-[13px] text-paid-mist/90">
              https://paid-app.com
            </span>
            ) and the connection key below.
          </p>
          <p className="mt-6 text-sm text-paid-mist/60">
            Generate a connection key for the add-on (you can rotate it anytime):
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-[#00E5A0] px-4 py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110"
            onClick={async () => {
              const res = await fetch("/api/auth/api-key", { method: "POST" });
              const j = (await res.json()) as { api_key?: string; error?: string };
              if (res.ok && j.api_key) {
                try {
                  await navigator.clipboard.writeText(j.api_key);
                } catch {
                  /* ignore */
                }
                window.alert(
                  "Connection key copied. Paste it into Paid in Gmail under add-on settings."
                );
              } else {
                window.alert(j.error ?? "Could not create a key. Try again.");
              }
            }}
          >
            Generate and copy key
          </button>

          <div className="mt-10 border-t border-white/10 pt-8">
            {canFinishSetup ? (
              <>
                <p className="text-sm text-paid-mist/70">
                  When you are ready, continue to your dashboard.
                </p>
                <button
                  type="button"
                  disabled={completing}
                  onClick={() => void completeOnboarding()}
                  className="mt-4 rounded-lg border border-[#00E5A0]/50 bg-[#00E5A0]/10 px-5 py-2.5 text-sm font-semibold text-[#00E5A0] transition hover:bg-[#00E5A0]/15 disabled:opacity-50"
                >
                  {completing ? "Saving…" : "Go to dashboard"}
                </button>
                {completeError && (
                  <p className="mt-2 text-sm text-red-400" role="alert">
                    {completeError}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-paid-mist/65" role="status">
                Connect QuickBooks and Gmail above to continue.
              </p>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

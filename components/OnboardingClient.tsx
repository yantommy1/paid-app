"use client";

import { createClient } from "@/lib/supabase/browser";
import { clearPendingPlan, getPendingPlan } from "@/lib/billing/pending-plan";
import { SmartLogoLink } from "@/components/SmartLogoLink";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function computeOnboardingStep(quickbooksConnected: boolean, gmailConnected: boolean, initialStep?: string): number {
  let step = quickbooksConnected && gmailConnected ? 3 : quickbooksConnected ? 2 : 1;
  if (initialStep === "quickbooks-done" && quickbooksConnected) step = Math.max(step, 2);
  if (initialStep === "gmail-done" && quickbooksConnected && gmailConnected) step = Math.max(step, 3);
  return step;
}

type Tone = "friendly" | "professional" | "firm";

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
  displayName: string;
  quickbooksConnected: boolean;
  gmailConnected: boolean;
};

export function OnboardingClient({ initialStep, displayName, quickbooksConnected, gmailConnected }: Props) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [qbConn, setQbConn] = useState(quickbooksConnected);
  const [gmConn, setGmConn] = useState(gmailConnected);

  // Step 3: reminder preferences (optional)
  const [tone, setTone] = useState<Tone>("professional");
  const [payNowEnabled, setPayNowEnabled] = useState<boolean>(true);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [bookkeeperEmail, setBookkeeperEmail] = useState<string>("");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);

  // Step 4: Stripe Connect (optional)
  const [acceptCard, setAcceptCard] = useState<boolean>(true);
  const [acceptAch, setAcceptAch] = useState<boolean>(true);
  const [stripeConnected, setStripeConnected] = useState<boolean>(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/connect/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { connected?: boolean } | null) => {
        if (cancelled || !j) return;
        if (typeof j.connected === "boolean") setStripeConnected(j.connected);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function startStripeConnect() {
    setStripeBusy(true);
    setStripeMessage(null);
    try {
      // Save payment method preferences alongside the Connect handoff so the
      // settings stick even if the merchant doesn't finish onboarding now.
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accept_card: acceptCard,
          accept_ach: acceptAch,
        }),
      }).catch(() => {});

      const res = await fetch("/api/stripe/connect/status");
      const j = (await res.json()) as {
        connected?: boolean;
        onboardingUrl?: string | null;
        error?: string;
      };
      if (j.connected) {
        setStripeConnected(true);
        setStripeMessage("Stripe is already connected.");
        return;
      }
      if (j.onboardingUrl) {
        window.location.href = j.onboardingUrl;
        return;
      }
      setStripeMessage(j.error ?? "Could not start Stripe setup.");
    } catch {
      setStripeMessage("Network error starting Stripe.");
    } finally {
      setStripeBusy(false);
    }
  }

  async function savePreferences() {
    setSavingPrefs(true);
    setPrefsMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone_default: tone,
          tone_auto_adjust: true,
          payment_link_enabled: payNowEnabled,
          early_pay_discount_pct: discountPct,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setPrefsMessage(j.error ?? "Could not save preferences.");
        return;
      }

      // Optional bookkeeper invite
      if (bookkeeperEmail.trim()) {
        try {
          await fetch("/api/bookkeeper/invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookkeeper_email: bookkeeperEmail.trim(),
              permissions: "send",
            }),
          });
        } catch {
          // Non-fatal — owner can re-invite from Settings later.
        }
      }

      setPrefsSaved(true);
      setPrefsMessage("Saved. You can change any of this later in Settings.");
    } catch {
      setPrefsMessage("Could not save preferences.");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function completeOnboarding() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const j = (await res.json()) as { error?: string; nextPath?: string };
      if (!res.ok) {
        setCompleteError(j.error ?? "Could not save progress.");
        return;
      }
      const pendingPlan = getPendingPlan();
      if (pendingPlan?.priceId) {
        const checkoutRes = await fetch("/api/stripe/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ priceId: pendingPlan.priceId, plan: pendingPlan.plan }),
        });
        const checkoutJson = (await checkoutRes.json()) as { url?: string; error?: string };
        if (!checkoutRes.ok || !checkoutJson.url) {
          setCompleteError(
            typeof checkoutJson.error === "string"
              ? checkoutJson.error
              : "Could not start checkout. Continue from pricing."
          );
          router.push("/pricing");
          router.refresh();
          return;
        }
        clearPendingPlan();
        window.location.href = checkoutJson.url;
        return;
      }
      router.push(j.nextPath ?? "/pricing");
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
          <SmartLogoLink loggedIn className="font-display text-3xl text-[#0D0D0D]" />
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Setup</p>
          <p className="mt-4 text-sm text-[#6B6B6B]">Signed in as {displayName}</p>
        </div>
        <button type="button" onClick={() => void signOut()} className="border border-[#1B4332] px-4 py-2 text-sm text-[#1B4332]">Sign out</button>
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
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#1B4332]">Step 3 · optional</span>
          <h2 className="mt-2 font-display text-2xl">Tune your reminders</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
            Set the defaults Paid will use when drafting every reminder. You can override
            any of this per invoice in the Gmail Add-On, and change it later in Settings.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Default tone</label>
              <div className="mt-2 inline-flex border border-[#E5E5E5]">
                {(["friendly", "professional", "firm"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`px-4 py-2 text-sm capitalize ${
                      tone === t
                        ? "bg-[#1B4332] text-white"
                        : "bg-white text-[#0D0D0D] hover:bg-[#F7F7F5]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#6B6B6B]">
                Auto-adjusts firmer for $10k+ invoices and clients with prior late payments.
                Slide tone per-reminder in the Gmail Add-On.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-[#0D0D0D]">
                <input
                  type="checkbox"
                  checked={payNowEnabled}
                  onChange={(e) => setPayNowEnabled(e.target.checked)}
                />
                Add a Pay Now button to every reminder
              </label>
              <p className="mt-1 ml-6 text-xs text-[#6B6B6B]">
                Requires a Stripe Connect account (set up later in Settings → Billing).
                Off = email goes out without a payment link.
              </p>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Early-pay discount</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Number(e.target.value || 0))}
                  className="w-24 border border-[#E5E5E5] px-3 py-2 text-sm"
                />
                <span className="text-sm text-[#6B6B6B]">% if paid within 7 days. 0 = off.</span>
              </div>
            </div>

            <div className="border-t border-[#E5E5E5] pt-6">
              <label className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">
                Send your overdue queue to a bookkeeper (optional)
              </label>
              <input
                type="email"
                placeholder="bookkeeper@firm.com"
                value={bookkeeperEmail}
                onChange={(e) => setBookkeeperEmail(e.target.value)}
                className="mt-2 block w-full max-w-md border border-[#E5E5E5] px-3 py-2 text-sm"
              />
              <p className="mt-2 text-xs text-[#6B6B6B]">
                We&apos;ll generate a magic link they can use to review and approve your
                drafts. You stay in control — the actual Send happens from your Gmail.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E5E5] pt-6">
              <button
                type="button"
                onClick={() => void savePreferences()}
                disabled={savingPrefs}
                className="bg-[#1B4332] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingPrefs ? "Saving…" : prefsSaved ? "Save changes" : "Save preferences"}
              </button>
              <span className="text-xs text-[#6B6B6B]">
                Or skip — defaults work fine and you can edit anytime in Settings.
              </span>
            </div>
            {prefsMessage && (
              <p className={`text-sm ${prefsSaved ? "text-[#1B4332]" : "text-red-600"}`}>
                {prefsMessage}
              </p>
            )}
          </div>
        </li>

        <li className={`${card} border-l-4 ${step >= 3 ? "border-l-[#1B4332]" : "border-l-transparent"}`}>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#1B4332]">Step 4 · optional</span>
          <h2 className="mt-2 font-display text-2xl">Connect Stripe to accept payments</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
            With Stripe connected, every reminder gets a Pay Now button and your clients
            can pay with one click — no account creation on their end. ~5 minute setup,
            and you can skip this and turn it on later in Settings.
          </p>

          {stripeConnected ? (
            <div className="mt-5">
              <ConnectedPill />
              <p className="mt-3 text-sm text-[#6B6B6B]">
                Stripe Connect is set up. Pay Now buttons are active on every reminder.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">
                  Which payment methods do you want to accept?
                </p>
                <div className="mt-3 flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm text-[#0D0D0D]">
                    <input
                      type="checkbox"
                      checked={acceptCard}
                      onChange={(e) => setAcceptCard(e.target.checked)}
                    />
                    Credit / debit card{" "}
                    <span className="text-xs text-[#6B6B6B]">(2.9% + $0.30)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#0D0D0D]">
                    <input
                      type="checkbox"
                      checked={acceptAch}
                      onChange={(e) => setAcceptAch(e.target.checked)}
                    />
                    ACH bank debit{" "}
                    <span className="text-xs text-[#6B6B6B]">(0.8%, capped at $5)</span>
                  </label>
                </div>
                <p className="mt-2 text-xs text-[#6B6B6B]">
                  ACH is dramatically cheaper for $5k+ invoices. We recommend leaving both on.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void startStripeConnect()}
                  disabled={stripeBusy || (!acceptCard && !acceptAch)}
                  className="bg-[#1B4332] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {stripeBusy ? "Opening Stripe…" : "Connect Stripe"}
                </button>
                <span className="text-xs text-[#6B6B6B]">
                  Or skip — you can connect later in Settings.
                </span>
              </div>
              {stripeMessage && (
                <p className="text-sm text-red-600">{stripeMessage}</p>
              )}
            </div>
          )}
        </li>

        <li className={`${card} border-l-4 ${step >= 3 ? "border-l-[#1B4332]" : "border-l-transparent"}`}>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#1B4332]">Step 5</span>
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
                  {completing ? "Saving..." : "Finish setup"}
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

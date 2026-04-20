"use client";

import type { AuthIntent } from "@/components/LandingEmailForm";
import { LandingEmailForm } from "@/components/LandingEmailForm";
import { GmailSidebarMockup } from "@/components/landing/GmailSidebarMockup";
import { SectionReveal } from "@/components/landing/SectionReveal";
import { useCallback, useRef, useState } from "react";

export function HomeLanding() {
  const emailSignupRef = useRef<HTMLElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIntent, setModalIntent] = useState<AuthIntent>("signup");
  const [inlineIntent, setInlineIntent] = useState<AuthIntent>("signup");

  const openModal = useCallback((intent: AuthIntent) => {
    setModalIntent(intent);
    setModalOpen(true);
  }, []);

  /** Reliable auth entry: open dialog + scroll the inline form into view (fallback if modal closed). */
  const goToAuth = useCallback(
    (intent: AuthIntent) => {
      setInlineIntent(intent);
      openModal(intent);
      window.setTimeout(() => {
        const el =
          emailSignupRef.current ??
          document.getElementById("email-signup");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    },
    [openModal]
  );

  return (
    <div className="min-h-screen bg-paid-ink text-paid-mist">
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md border border-white/15 bg-paid-ink p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 rounded p-1 text-2xl leading-none text-paid-mist/50 transition hover:text-paid-mist"
              aria-label="Close"
            >
              ×
            </button>
            <h2
              id="auth-modal-title"
              className="font-display text-2xl text-paid-mist pr-8"
            >
              {modalIntent === "signup" ? "Join Paid" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-paid-mist/60">
              {modalIntent === "signup"
                ? "Use a magic link or password \u2014 your choice in the form below."
                : "Magic link or password \u2014 pick what works best for you."}
            </p>
            <div className="mt-6">
              <LandingEmailForm
                key={`modal-${modalOpen}-${modalIntent}`}
                variant="dark"
                intent={modalIntent}
              />
            </div>
          </div>
        </div>
      )}

      <nav className="border-b border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="font-display text-2xl tracking-tight text-paid-mist">
            Paid
          </span>
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={() => goToAuth("signup")}
              className="text-sm font-medium text-paid-mist/80 transition hover:text-[#00E5A0]"
            >
              Get started
            </button>
            <button
              type="button"
              onClick={() => goToAuth("signin")}
              className="text-sm font-medium text-paid-mist/80 transition hover:text-[#00E5A0]"
            >
              Sign in
            </button>
          </div>
        </div>
      </nav>

      <main>
        <section className="border-b border-white/[0.08]">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-6 py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:py-28">
            <SectionReveal>
              <div>
                <h1 className="font-display text-[2.65rem] font-normal leading-[0.98] tracking-tight text-paid-mist sm:text-5xl md:text-6xl lg:text-[4.25rem]">
                  Your invoices.
                  <br />
                  Collected.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-paid-mist/72">
                  Paid connects QuickBooks and Gmail, then sends AI-drafted payment
                  reminders in your voice \u2014 automatically.
                </p>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => goToAuth("signup")}
                    className="inline-flex items-center justify-center rounded-md bg-[#00E5A0] px-6 py-3 text-sm font-semibold text-paid-ink transition hover:brightness-110"
                  >
                    Get started free
                  </button>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center rounded-md border border-white/20 px-6 py-3 text-sm font-medium text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0]"
                  >
                    See how it works
                  </a>
                </div>
              </div>
            </SectionReveal>
            <SectionReveal className="lg:justify-self-end">
              <GmailSidebarMockup />
            </SectionReveal>
          </div>
        </section>

        <section className="border-b border-white/[0.08]">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <SectionReveal>
              <h2 className="max-w-3xl font-display text-3xl leading-tight tracking-tight text-paid-mist md:text-4xl lg:text-[2.75rem]">
                You did the work. Getting paid shouldn&apos;t be.
              </h2>
              <div className="mt-14 grid gap-6 md:grid-cols-3">
                {[
                  {
                    stat: "$825B",
                    rest: "in outstanding AR held by US small businesses",
                  },
                  {
                    stat: "47",
                    rest: "days average payment delay in professional services",
                  },
                  {
                    stat: "23%",
                    rest: "of invoices are never collected after 90 days",
                  },
                ].map((card) => (
                  <div
                    key={card.stat}
                    className="border border-white/[0.08] border-l-2 border-l-[#00E5A0] bg-white/[0.02] px-6 py-7"
                  >
                    <p className="font-mono text-3xl tabular-nums tracking-tight text-paid-mist md:text-[2rem]">
                      {card.stat}
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-paid-mist/65">
                      {card.rest}
                    </p>
                  </div>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-24 border-b border-white/[0.08]"
        >
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <SectionReveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                How it works
              </p>
              <h2 className="mt-3 font-display text-3xl tracking-tight text-paid-mist md:text-4xl">
                Three steps. One outcome.
              </h2>
              <div className="mt-16 lg:mt-20">
                <div className="relative lg:pt-2">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-[5%] right-[5%] top-[21px] hidden h-px bg-white/[0.12] lg:block"
                  />
                  <div className="grid gap-12 lg:grid-cols-3 lg:gap-8">
                    {[
                      {
                        step: "01",
                        title: "Connect QuickBooks",
                        body: "Syncs your AR aging automatically.",
                      },
                      {
                        step: "02",
                        title: "AI drafts the reminder",
                        body: "Calibrated to relationship and days overdue.",
                      },
                      {
                        step: "03",
                        title: "Sends from your Gmail",
                        body: "Looks like you wrote it, not a robot.",
                      },
                    ].map((item, i) => (
                      <div key={item.step} className="relative flex flex-col">
                        <div className="mb-6 flex items-center gap-4 lg:block">
                          <span className="relative z-[1] inline-flex h-10 w-10 shrink-0 items-center justify-center border border-white/15 bg-paid-ink font-mono text-xs text-[#00E5A0]">
                            {item.step}
                          </span>
                          {i < 2 && (
                            <div
                              aria-hidden
                              className="h-px flex-1 bg-white/[0.12] lg:hidden"
                            />
                          )}
                        </div>
                        <h3 className="font-display text-xl text-paid-mist">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-paid-mist/65">
                          {item.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionReveal>
          </div>
        </section>

        <section className="border-b border-white/[0.08]">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <SectionReveal>
              <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
                <div>
                  <h2 className="font-display text-3xl leading-[1.12] tracking-tight text-paid-mist md:text-4xl lg:text-[2.65rem]">
                    Built for firms that bill on trust \u2014 and need cash in the door.
                  </h2>
                </div>
                <ul className="divide-y divide-white/[0.08] border-t border-white/[0.08]">
                  {[
                    "Sends from your real Gmail address \u2014 not a noreply",
                    "Tone calibrated to 30 / 60 / 90 day buckets",
                    "Surfaces overdue invoices when you open a client email",
                    "One-tap send from the Gmail sidebar",
                    "Stronger follow-up for balances past 60 days",
                  ].map((line) => (
                    <li
                      key={line}
                      className="py-5 text-sm leading-relaxed text-paid-mist/80 transition hover:text-[#00E5A0]"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </SectionReveal>
          </div>
        </section>

        <section
          ref={emailSignupRef}
          id="email-signup"
          className="scroll-mt-24 border-b border-white/[0.08]"
        >
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <SectionReveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                Pricing
              </p>
              <h2 className="mt-3 font-display text-3xl tracking-tight text-paid-mist md:text-4xl">
                Straightforward. No surprises.
              </h2>
              <div className="mt-14 grid gap-6 md:grid-cols-2">
                <div className="flex flex-col border border-white/[0.1] bg-white/[0.02] p-8">
                  <p className="font-display text-xl text-paid-mist">Starter</p>
                  <p className="mt-4 font-mono text-4xl tabular-nums text-paid-mist">
                    $49
                    <span className="text-lg text-paid-mist/45">/mo</span>
                  </p>
                  <ul className="mt-8 flex-1 space-y-3 text-sm text-paid-mist/70">
                    <li>Up to 50 invoices</li>
                    <li>AI reminders</li>
                    <li>Gmail Add-On</li>
                    <li>QuickBooks sync</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => goToAuth("signup")}
                    className="mt-10 inline-flex w-full items-center justify-center rounded-md border border-white/20 py-3 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:bg-[#00E5A0]/10 hover:text-[#00E5A0]"
                  >
                    Get started
                  </button>
                </div>
                <div className="flex flex-col border border-[#00E5A0]/45 bg-[#00E5A0]/[0.04] p-8">
                  <p className="font-display text-xl text-paid-mist">Pro</p>
                  <p className="mt-4 font-mono text-4xl tabular-nums text-paid-mist">
                    $99
                    <span className="text-lg text-paid-mist/45">/mo</span>
                  </p>
                  <ul className="mt-8 flex-1 space-y-3 text-sm text-paid-mist/75">
                    <li>Unlimited invoices</li>
                    <li>Recovery tools for long-past-due balances</li>
                    <li>Priority support</li>
                    <li>Custom reminder sequences</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => goToAuth("signup")}
                    className="mt-10 inline-flex w-full items-center justify-center rounded-md bg-[#00E5A0] py-3 text-sm font-semibold text-paid-ink transition hover:brightness-110"
                  >
                    Get started
                  </button>
                </div>
              </div>

              <div className="mx-auto mt-20 max-w-lg border border-white/[0.1] bg-white/[0.02] p-8 md:p-10">
                <div className="flex flex-wrap gap-2 rounded-md border border-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setInlineIntent("signup")}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition ${
                      inlineIntent === "signup"
                        ? "bg-[#00E5A0]/15 text-[#00E5A0]"
                        : "text-paid-mist/60 hover:text-paid-mist"
                    }`}
                  >
                    New to Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlineIntent("signin")}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition ${
                      inlineIntent === "signin"
                        ? "bg-[#00E5A0]/15 text-[#00E5A0]"
                        : "text-paid-mist/60 hover:text-paid-mist"
                    }`}
                  >
                    Sign in
                  </button>
                </div>
                <h3 className="mt-6 font-display text-2xl text-paid-mist">
                  {inlineIntent === "signup"
                    ? "Create your account"
                    : "Sign in to Paid"}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-paid-mist/60">
                  {inlineIntent === "signup"
                    ? "Enter your work email \u2014 we will send a link to get you started in one click."
                    : "Enter the email you used before \u2014 we will send a link to open Paid."}
                </p>
                <div className="mt-8">
                  <LandingEmailForm
                    key={`inline-${inlineIntent}`}
                    variant="dark"
                    intent={inlineIntent}
                  />
                </div>
              </div>
            </SectionReveal>
          </div>
        </section>

        <footer className="border-t border-white/[0.08]">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-8">
              <span className="font-display text-xl text-paid-mist">Paid</span>
              <span className="text-sm text-paid-mist/50">
                Built for professional services firms.
              </span>
            </div>
            <p className="text-sm text-paid-mist/40">
              {"\u00A9 "}
              {new Date().getFullYear()} Paid. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

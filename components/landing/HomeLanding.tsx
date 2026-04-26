"use client";

import { LandingEmailForm } from "@/components/LandingEmailForm";
import { EmailCaptureModal } from "@/components/EmailCaptureModal";
import { GmailSidebarMockup } from "@/components/landing/GmailSidebarMockup";
import { SectionReveal } from "@/components/landing/SectionReveal";
import { SmartLogoLink } from "@/components/SmartLogoLink";
import Link from "next/link";
import { useEffect, useState } from "react";

function navAvatarLetter(displayName: string | null): string {
  const trimmed = (displayName ?? "").trim();
  if (trimmed.length > 0) return trimmed.charAt(0).toUpperCase();
  return "?";
}

export function HomeLanding({
  starterPriceId,
  proPriceId,
  isLoggedIn,
  userEmail,
  userDisplayName,
}: {
  starterPriceId: string;
  proPriceId: string;
  isLoggedIn: boolean;
  userEmail: string | null;
  userDisplayName: string | null;
}) {
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [navShadow, setNavShadow] = useState(false);
  const [openPlan, setOpenPlan] = useState<"starter" | "pro" | null>(null);
  const [summary, setSummary] = useState<{
    totalOutstanding: number;
    overdueInvoiceCount: number;
    overdueClientCount: number;
  } | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    fetch("/api/invoices/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data:
          | {
              header?: { totalOutstanding?: number; overdueClientCount?: number };
              overdueInvoiceCount?: number;
            }
          | null) => {
          if (cancelled || !data) return;
          setSummary({
            totalOutstanding: Number(data.header?.totalOutstanding ?? 0),
            overdueInvoiceCount: Number(data.overdueInvoiceCount ?? 0),
            overdueClientCount: Number(data.header?.overdueClientCount ?? 0),
          });
        }
      )
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    const onScroll = () => setNavShadow(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function onStartFreeTrial(plan: "starter" | "pro" = "starter") {
    setOpenPlan(plan);
  }

  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <nav
        className={`sticky top-0 z-30 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-sm ${
          navShadow ? "shadow-sm" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-5">
          <SmartLogoLink
            loggedIn={isLoggedIn}
            className="font-display text-4xl font-semibold text-[#0D0D0D]"
          />
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E5E5] text-sm text-[#0D0D0D]">
                {navAvatarLetter(userDisplayName)}
              </span>
              <Link href="/dashboard" className="text-sm text-[#0D0D0D]">
                Dashboard
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-6 text-sm text-[#0D0D0D]">
              <button type="button" onClick={() => onStartFreeTrial("starter")}>
                Start free trial
              </button>
              <button type="button" onClick={() => setSignInModalOpen(true)}>Sign in</button>
            </div>
          )}
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-[#F0F7F4] py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-40 lg:block"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(229,229,229,0.9) 1px, transparent 0)",
              backgroundSize: "14px 14px",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 top-8 h-[540px] w-[540px] rounded-full border-[72px] border-[#1B4332]/[0.04]"
          />
          <div className="relative mx-auto grid w-full max-w-[1200px] gap-14 px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
            <SectionReveal>
              <div>
                <p className="mb-6 text-sm uppercase tracking-[0.22em] text-[#1B4332]">AI Receivables</p>
                <h1 className="font-display text-[3.2rem] leading-[0.92] tracking-tight text-[#0D0D0D] sm:text-[4.4rem] lg:text-8xl">
                  You did the work.
                  <br />
                  We&apos;ll get you{" "}
                  <span className="relative inline-block border-b-2 border-[#1B4332]">paid</span>.
                </h1>
                <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[#6B6B6B]">
                  Paid syncs your invoices and sends AI-drafted payment reminders from your real email — automatically, in your voice.
                </p>
                <div className="mt-10 flex flex-wrap items-center gap-6">
                  <button
                    type="button"
                    onClick={() => onStartFreeTrial("starter")}
                    className="bg-[#1B4332] px-6 py-3 text-sm font-medium text-white"
                  >
                    Start free trial
                  </button>
                  <a href="#how-it-works" className="text-sm text-[#0D0D0D]">
                    See how it works →
                  </a>
                </div>
              </div>
            </SectionReveal>
            <SectionReveal className="lg:justify-self-end">
              <div className="relative">
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1B4332]/10 blur-3xl"
                />
                <GmailSidebarMockup />
              </div>
            </SectionReveal>
          </div>
        </section>

        <section className="border-y border-[#E5E5E5] bg-white py-4">
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-center gap-3 px-6 font-mono text-xs text-[#6B6B6B] sm:gap-5">
            <span>$2.4M recovered</span>
            <span className="h-4 w-px bg-[#E5E5E5]" aria-hidden />
            <span>847 invoices collected</span>
            <span className="h-4 w-px bg-[#E5E5E5]" aria-hidden />
            <span>avg 31 days to payment</span>
            <span className="h-4 w-px bg-[#E5E5E5]" aria-hidden />
            <span>4.9★ rating</span>
          </div>
        </section>

        <section className="bg-[#F7F7F5] py-10">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <p className="text-center text-sm uppercase tracking-[0.22em] text-[#6B6B6B]">
              Trusted by professional services firms
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {["Law Firms", "Architecture", "Consulting", "Accounting", "Engineering"].map((label) => (
                <div
                  key={label}
                  className="flex h-14 items-center justify-center border border-[#E5E5E5] bg-[#F7F7F5] text-sm text-[#6B6B6B]"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[#E5E5E5] bg-white py-24">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">The AR Reality</p>
              <h2 className="font-display text-4xl tracking-tight text-[#0D0D0D]">
                Getting paid shouldn&apos;t be a second job.
              </h2>
              <div className="mt-14 grid gap-6 md:grid-cols-3">
                {[
                  { stat: "$825B", body: "in outstanding AR held by US small businesses" },
                  { stat: "47", body: "days average payment delay in professional services" },
                  { stat: "23%", body: "of invoices are never collected after 90 days" },
                ].map((card) => (
                  <article
                    key={card.stat}
                    className="border border-[#E5E5E5] border-l-[3px] border-l-[#1B4332] bg-[#F0F7F4] px-6 py-7"
                  >
                    <p className="font-display text-5xl leading-none text-[#1B4332]">{card.stat}</p>
                    <p className="mt-4 text-sm leading-relaxed text-[#6B6B6B]">{card.body}</p>
                  </article>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#1B4332] py-24 text-white">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <p className="text-sm uppercase tracking-[0.22em] text-[#C8D9D1]">How it works</p>
              <h2 className="mt-3 font-display text-5xl text-white">Three steps. One outcome.</h2>
              <div className="mt-14 grid gap-8 md:grid-cols-3">
                {[
                  ["1", "Connect QuickBooks", "Sync open invoices and customer details."],
                  ["2", "Generate reminders", "Create polished follow-up drafts for each client."],
                  ["3", "Send from Gmail", "Deliver reminders from the inbox your clients trust."],
                ].map(([n, t, b]) => (
                  <article key={t} className="space-y-3 rounded-lg border border-white/15 bg-white/5 p-5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-medium text-[#1B4332]">
                      {n}
                    </span>
                    <h3 className="text-lg font-medium text-white">{t}</h3>
                    <p className="text-sm leading-relaxed text-[#D4E2DC]">{b}</p>
                  </article>
                ))}
              </div>
              <div className="mt-14 hidden items-center justify-center gap-4 md:flex">
                {[
                  ["Connect", "QuickBooks"],
                  ["Draft", "AI Reminder"],
                  ["Send", "From Gmail"],
                ].map(([title, sub], idx) => (
                  <div key={title} className="flex items-center gap-4">
                    <div className="w-[160px] rounded border border-white/20 bg-white/10 px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-1 text-xs text-[#D4E2DC]">{sub}</p>
                    </div>
                    {idx < 2 && <span className="text-xl text-white/80">→</span>}
                  </div>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>

        {!isLoggedIn && (
        <section className="bg-[#F7F7F5] py-24">
          <div className="mx-auto grid w-full max-w-[1200px] gap-12 px-6 lg:grid-cols-2 lg:gap-20">
            <SectionReveal>
              <h2 className="font-display text-[42px] leading-tight text-[#0D0D0D]">
                Built for firms that bill on trust — and need cash in the door.
              </h2>
            </SectionReveal>
            <SectionReveal>
              <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Features</p>
              <div className="border-t border-[#E5E5E5]">
                {[
                  "Reminders sent from your real email address — not a noreply",
                  "Tone calibrated to 30, 60, and 90 day buckets",
                  "One click to send from your inbox",
                ].map((line, idx) => (
                  <p key={line} className="relative overflow-hidden border-b border-[#E5E5E5] py-5 pl-10 text-sm text-[#0D0D0D] transition hover:text-[#1B4332]">
                    <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[52px] font-display leading-none text-[#F0F0F0]">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {line}
                  </p>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>
        )}

        {!isLoggedIn ? (
          <section className="bg-white py-24">
            <div className="mx-auto w-full max-w-[1200px] px-6">
              <SectionReveal>
                <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Testimonials</p>
                <h2 className="mt-3 font-display text-5xl text-[#0D0D0D]">
                  What firms say after switching to Paid
                </h2>
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                  {[
                    {
                      quote:
                        "We had $47,000 sitting in overdue invoices. Paid recovered $38,000 of it in the first month without a single awkward phone call.",
                      name: "Sarah Chen",
                      title: "Managing Partner, Chen & Associates Law",
                    },
                    {
                      quote:
                        "I used to spend two hours every Friday chasing payments. Now I open Gmail and Paid has already sent the reminders. I haven't thought about AR in weeks.",
                      name: "Marcus Webb",
                      title: "Principal, Webb Architecture",
                    },
                    {
                      quote:
                        "Our average collection time went from 67 days to 23 days. The reminders sound exactly like something I would write — clients don't even know it's automated.",
                      name: "Priya Nair",
                      title: "Founder, Nair Consulting Group",
                    },
                  ].map((t) => (
                    <article key={t.name} className="border border-[#E5E5E5] bg-white p-6 shadow-sm">
                      <p className="font-display text-[80px] leading-none text-[#1B4332]">“</p>
                      <p className="mt-4 font-display text-xl leading-relaxed text-[#0D0D0D]">{t.quote}</p>
                      <p className="mt-6 text-sm font-semibold text-[#0D0D0D]">{t.name}</p>
                      <p className="mt-1 text-sm text-[#6B6B6B]">{t.title}</p>
                    </article>
                  ))}
                </div>
              </SectionReveal>
            </div>
          </section>
        ) : (
          <section className="bg-[#F7F7F5] py-24">
            <div className="mx-auto w-full max-w-[1200px] px-6">
              <SectionReveal>
                <div className="mx-auto max-w-3xl border border-[#E5E5E5] bg-white p-10 text-center">
                  <p className="text-sm uppercase tracking-[0.2em] text-[#1B4332]">Welcome back</p>
                  <h2 className="mt-3 font-display text-4xl text-[#0D0D0D]">
                    Welcome back, {userDisplayName ?? "there"}
                  </h2>
                  <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    <article className="border border-[#E5E5E5] bg-white p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
                        Total outstanding
                      </p>
                      <p className="mt-2 font-display text-3xl text-[#0D0D0D]">
                        $
                        {(summary?.totalOutstanding ?? 0).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </article>
                    <article className="border border-[#E5E5E5] bg-white p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
                        Overdue invoices
                      </p>
                      <p className="mt-2 font-display text-3xl text-[#0D0D0D]">
                        {summary?.overdueInvoiceCount ?? 0}
                      </p>
                    </article>
                    <article className="border border-[#E5E5E5] bg-white p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
                        Clients overdue
                      </p>
                      <p className="mt-2 font-display text-3xl text-[#0D0D0D]">
                        {summary?.overdueClientCount ?? 0}
                      </p>
                    </article>
                  </div>
                  <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-center bg-[#1B4332] px-6 py-3 text-sm font-medium text-white"
                    >
                      Go to dashboard
                    </Link>
                    <a
                      href="https://mail.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center border border-[#E5E5E5] bg-white px-6 py-3 text-sm font-medium text-[#0D0D0D]"
                    >
                      Open Gmail
                    </a>
                  </div>
                </div>
              </SectionReveal>
            </div>
          </section>
        )}

        {!isLoggedIn && (
        <section className="bg-[#F7F7F5] py-24">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Pricing</p>
              <h2 className="mt-3 font-display text-5xl text-[#0D0D0D]">Simple pricing. No surprises.</h2>
              <div className="mt-14 grid gap-6 md:grid-cols-2">
                <article className="border border-[#E5E5E5] bg-white p-8">
                  <h3 className="font-display text-2xl text-[#0D0D0D]">Starter</h3>
                  <p className="mt-3 font-display text-5xl text-[#0D0D0D]">
                    $29<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
                  </p>
                  <div className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
                    <p>Up to 50 invoices</p>
                    <p>AI reminders</p>
                    <p>Gmail Add-On</p>
                    <p>QuickBooks sync</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartFreeTrial("starter")}
                    className="mt-10 flex w-full items-center justify-center border border-[#1B4332] py-3 text-sm font-medium text-[#1B4332]"
                  >
                    Start free trial
                  </button>
                </article>

                <article className="border border-[#1B4332] bg-[#1B4332]/[0.05] p-8">
                  <p className="-mx-8 -mt-8 mb-6 bg-[#1B4332] px-8 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white">
                    Most Popular
                  </p>
                  <h3 className="font-display text-2xl text-[#0D0D0D]">Pro</h3>
                  <p className="mt-3 font-display text-5xl text-[#0D0D0D]">
                    $49<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
                  </p>
                  <div className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
                    <p>Unlimited invoices</p>
                    <p>Custom reminder strategies</p>
                    <p>Priority support</p>
                    <p>Advanced recovery workflows</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartFreeTrial("pro")}
                    className="mt-10 flex w-full items-center justify-center bg-[#1B4332] py-3 text-sm font-medium text-white"
                  >
                    Start free trial
                  </button>
                </article>
              </div>

              <div className="mx-auto mt-20 max-w-xl border border-[#E5E5E5] bg-white p-8">
                <h3 className="font-display text-3xl text-[#0D0D0D]">Already have an account?</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
                  Sign in with your email to manage billing, connect integrations, and view reminders.
                </p>
                <div className="mt-8">
                  <LandingEmailForm variant="light" intent="signin" />
                </div>
              </div>
            </SectionReveal>
          </div>
        </section>
        )}

        <section className="bg-[#1B4332] py-20 text-white">
          <div className="mx-auto max-w-[1200px] px-6 text-center">
            <h2 className="font-display text-5xl">Ready to stop chasing invoices?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-[#D4E2DC]">
              Start your free trial in under a minute and put automated follow-up on autopilot.
            </p>
            <button
              type="button"
              onClick={() => onStartFreeTrial("starter")}
              className="mt-8 bg-white px-6 py-3 text-sm font-semibold text-[#1B4332]"
            >
              Start free trial
            </button>
          </div>
        </section>

        <footer className="bg-[#0D0D0D] py-12 text-white">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-6">
              <span className="font-display text-2xl text-white">Paid</span>
              <Link href="/privacy" className="text-sm text-[#7FB39E] hover:text-[#A8D0C1]">Privacy</Link>
              <Link href="/terms" className="text-sm text-[#7FB39E] hover:text-[#A8D0C1]">Terms</Link>
            </div>
            <p className="text-sm text-[#D7D7D7]">You did the work. We&apos;ll get you paid.</p>
          </div>
        </footer>
      </main>

      {signInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D0D0D]/30 px-4">
          <div className="w-full max-w-md border border-[#E5E5E5] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl text-[#0D0D0D]">Sign in to Paid</h2>
              <button
                type="button"
                onClick={() => setSignInModalOpen(false)}
                className="text-sm text-[#6B6B6B]"
              >
                Close
              </button>
            </div>
            <LandingEmailForm intent="signin" variant="light" />
          </div>
        </div>
      )}
      {openPlan && (
        <EmailCaptureModal
          isOpen={openPlan !== null}
          onClose={() => setOpenPlan(null)}
          plan={openPlan}
          priceId={openPlan === "starter" ? starterPriceId : proPriceId}
          initialEmail={userEmail}
          skipCapture={Boolean(isLoggedIn && userEmail)}
        />
      )}
    </div>
  );
}

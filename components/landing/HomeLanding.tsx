"use client";

import type { AuthIntent } from "@/components/LandingEmailForm";
import { LandingEmailForm } from "@/components/LandingEmailForm";
import { GmailSidebarMockup } from "@/components/landing/GmailSidebarMockup";
import { SectionReveal } from "@/components/landing/SectionReveal";
import { createClient } from "@/lib/supabase/browser";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

function navAvatarLetter(user: User): string {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const name = meta?.full_name ?? meta?.name;
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length > 0) return trimmed.charAt(0).toUpperCase();
  return (user.email ?? "?").charAt(0).toUpperCase();
}

export function HomeLanding() {
  const emailSignupRef = useRef<HTMLElement>(null);
  const [inlineIntent, setInlineIntent] = useState<AuthIntent>("signup");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const goToAuth = useCallback((intent: AuthIntent) => {
    setInlineIntent(intent);
    window.setTimeout(() => {
      const el = emailSignupRef.current ?? document.getElementById("email-signup");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <nav className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-5">
          <span className="font-display text-3xl text-[#0D0D0D]">Paid</span>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E5E5] text-sm text-[#0D0D0D]">
                {navAvatarLetter(user)}
              </span>
              <Link href="/dashboard" className="text-sm text-[#0D0D0D]">
                Dashboard
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-6 text-sm text-[#0D0D0D]">
              <button type="button" onClick={() => goToAuth("signup")}>Get started</button>
              <button type="button" onClick={() => goToAuth("signin")}>Sign in</button>
            </div>
          )}
        </div>
      </nav>

      <main>
        <section className="py-24">
          <div className="mx-auto grid w-full max-w-[1200px] gap-14 px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
            <SectionReveal>
              <div>
                <div className="mb-8 h-[2px] w-12 bg-[#1B4332]" aria-hidden />
                <h1 className="font-display text-[3rem] leading-[0.95] tracking-tight text-[#0D0D0D] sm:text-[4rem] lg:text-[72px]">
                  You did the work.
                  <br />
                  We&apos;ll get you paid.
                </h1>
                <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[#6B6B6B]">
                  Paid syncs your invoices and sends AI-drafted payment reminders from your real email — automatically, in your voice.
                </p>
                <div className="mt-10 flex flex-wrap items-center gap-6">
                  <button
                    type="button"
                    onClick={() => goToAuth("signup")}
                    className="bg-black px-6 py-3 text-sm font-medium text-white"
                  >
                    Get started
                  </button>
                  <a href="#how-it-works" className="text-sm text-[#0D0D0D]">
                    See how it works →
                  </a>
                </div>
              </div>
            </SectionReveal>
            <SectionReveal className="lg:justify-self-end">
              <GmailSidebarMockup />
            </SectionReveal>
          </div>
        </section>

        <section className="border-t border-[#E5E5E5] py-24">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <h2 className="font-display text-4xl tracking-tight text-[#0D0D0D]">
                Getting paid shouldn&apos;t be a second job.
              </h2>
              <div className="mt-14 grid gap-6 md:grid-cols-3">
                {[
                  { stat: "$825B", body: "in outstanding AR held by US small businesses" },
                  { stat: "47", body: "days average payment delay in professional services" },
                  { stat: "23%", body: "of invoices are never collected after 90 days" },
                ].map((card) => (
                  <article key={card.stat} className="border border-[#E5E5E5] bg-white px-6 py-7">
                    <div className="mb-5 h-8 border-l-2 border-[#1B4332]" aria-hidden />
                    <p className="font-display text-5xl leading-none text-[#0D0D0D]">{card.stat}</p>
                    <p className="mt-4 text-sm leading-relaxed text-[#6B6B6B]">{card.body}</p>
                  </article>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#F7F7F5] py-24">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">How it works</p>
              <h2 className="mt-3 font-display text-4xl text-[#0D0D0D]">Three steps. One outcome.</h2>
              <div className="mt-14 grid gap-8 md:grid-cols-3">
                {[
                  ["1", "Connect QuickBooks", "Sync open invoices and customer details."],
                  ["2", "Generate reminders", "Create polished follow-up drafts for each client."],
                  ["3", "Send from Gmail", "Deliver reminders from the inbox your clients trust."],
                ].map(([n, t, b]) => (
                  <article key={t} className="space-y-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                      {n}
                    </span>
                    <h3 className="text-lg font-medium text-[#0D0D0D]">{t}</h3>
                    <p className="text-sm leading-relaxed text-[#6B6B6B]">{b}</p>
                  </article>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>

        <section className="py-24">
          <div className="mx-auto grid w-full max-w-[1200px] gap-12 px-6 lg:grid-cols-2 lg:gap-20">
            <SectionReveal>
              <h2 className="font-display text-[42px] leading-tight text-[#0D0D0D]">
                Built for firms that bill on trust — and need cash in the door.
              </h2>
            </SectionReveal>
            <SectionReveal>
              <div className="border-t border-[#E5E5E5]">
                {[
                  "Reminders sent from your real email address — not a noreply",
                  "Tone calibrated to 30, 60, and 90 day buckets",
                  "Surfaces overdue invoices when you open a client email",
                  "One click to send from your inbox",
                  "Stronger follow-up for balances past 60 days",
                ].map((line) => (
                  <p key={line} className="border-b border-[#E5E5E5] py-5 text-sm text-[#0D0D0D] transition hover:text-[#1B4332]">
                    {line}
                  </p>
                ))}
              </div>
            </SectionReveal>
          </div>
        </section>

        <section ref={emailSignupRef} id="email-signup" className="bg-[#F7F7F5] py-24">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Pricing</p>
              <h2 className="mt-3 font-display text-4xl text-[#0D0D0D]">Simple pricing. No surprises.</h2>
              <div className="mt-14 grid gap-6 md:grid-cols-2">
                <article className="border border-[#E5E5E5] bg-white p-8">
                  <h3 className="font-display text-2xl text-[#0D0D0D]">Starter</h3>
                  <p className="mt-3 font-display text-5xl text-[#0D0D0D]">
                    $49<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
                  </p>
                  <div className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
                    <p>Up to 50 invoices</p>
                    <p>AI reminders</p>
                    <p>Gmail Add-On</p>
                    <p>QuickBooks sync</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToAuth("signup")}
                    className="mt-10 w-full border border-black py-3 text-sm font-medium text-black"
                  >
                    Get started
                  </button>
                </article>

                <article className="border border-[#1B4332] bg-[#1B4332]/[0.05] p-8">
                  <h3 className="font-display text-2xl text-[#0D0D0D]">Pro</h3>
                  <p className="mt-3 font-display text-5xl text-[#0D0D0D]">
                    $99<span className="ml-1 text-lg text-[#6B6B6B]">/mo</span>
                  </p>
                  <div className="mt-8 space-y-2 text-sm text-[#6B6B6B]">
                    <p>Unlimited invoices</p>
                    <p>Custom reminder strategies</p>
                    <p>Priority support</p>
                    <p>Advanced recovery workflows</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToAuth("signup")}
                    className="mt-10 w-full bg-black py-3 text-sm font-medium text-white"
                  >
                    Get started
                  </button>
                </article>
              </div>

              <div className="mx-auto mt-20 max-w-xl border border-[#E5E5E5] bg-white p-8">
                <div className="flex border-b border-[#E5E5E5]">
                  <button
                    type="button"
                    onClick={() => setInlineIntent("signup")}
                    className={`px-3 py-2 text-sm ${inlineIntent === "signup" ? "border-b-2 border-black text-black" : "text-[#6B6B6B]"}`}
                  >
                    New to Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlineIntent("signin")}
                    className={`px-3 py-2 text-sm ${inlineIntent === "signin" ? "border-b-2 border-black text-black" : "text-[#6B6B6B]"}`}
                  >
                    Sign in
                  </button>
                </div>
                <h3 className="mt-6 font-display text-3xl text-[#0D0D0D]">
                  {inlineIntent === "signup" ? "Start collecting what you&apos;ve earned." : "Welcome back"}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
                  {inlineIntent === "signup"
                    ? "Enter your work email to get started."
                    : "Enter your email and we will send a secure sign-in link."}
                </p>
                <div className="mt-8">
                  <LandingEmailForm key={`inline-${inlineIntent}`} variant="light" intent={inlineIntent} />
                </div>
              </div>
            </SectionReveal>
          </div>
        </section>

        <footer className="border-t border-[#E5E5E5] py-12">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-6">
              <span className="font-display text-2xl text-[#0D0D0D]">Paid</span>
              <Link href="/privacy" className="text-sm text-[#6B6B6B] hover:text-[#0D0D0D]">Privacy</Link>
              <Link href="/terms" className="text-sm text-[#6B6B6B] hover:text-[#0D0D0D]">Terms</Link>
            </div>
            <p className="text-sm text-[#6B6B6B]">You did the work. We&apos;ll get you paid.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

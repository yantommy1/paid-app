"use client";

import { AuthSignInModal } from "@/components/AuthSignInModal";
import { GmailSidebarMockup } from "@/components/landing/GmailSidebarMockup";
import { SectionReveal } from "@/components/landing/SectionReveal";
import { createClient } from "@/lib/supabase/browser";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function navAvatarLetter(user: User): string {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const name = meta?.full_name ?? meta?.name;
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length > 0) return trimmed.charAt(0).toUpperCase();
  return (user.email ?? "?").charAt(0).toUpperCase();
}

function HeroPricingCards() {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2">
      <div className="border border-[#E5E5E5] bg-white p-5 shadow-sm">
        <h3 className="font-display text-xl text-[#0D0D0D]">Starter</h3>
        <p className="mt-2 font-display text-3xl text-[#0D0D0D]">
          $29<span className="ml-1 text-sm text-[#6B6B6B]">/mo</span>
        </p>
        <p className="mt-3 text-xs text-[#6B6B6B]">Up to 50 invoices · AI reminders</p>
        <Link
          href="/pricing"
          className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[#1B4332] py-2.5 text-center text-sm font-medium text-white hover:opacity-95"
        >
          Start free trial
        </Link>
      </div>
      <div className="border border-[#1B4332] bg-[#F7F7F5] p-5 shadow-sm">
        <p className="-mx-5 -mt-5 mb-4 bg-[#1B4332] py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
          Most popular
        </p>
        <h3 className="font-display text-xl text-[#0D0D0D]">Pro</h3>
        <p className="mt-2 font-display text-3xl text-[#0D0D0D]">
          $49<span className="ml-1 text-sm text-[#6B6B6B]">/mo</span>
        </p>
        <p className="mt-3 text-xs text-[#6B6B6B]">Unlimited invoices · Priority support</p>
        <Link
          href="/pricing"
          className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[#1B4332] py-2.5 text-center text-sm font-medium text-white hover:opacity-95"
        >
          Start free trial
        </Link>
      </div>
    </div>
  );
}

export function HomeLanding() {
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);
  const [ctaEmail, setCtaEmail] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  function onCtaSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = ctaEmail.trim();
    const url = q ? `/pricing?email=${encodeURIComponent(q)}` : "/pricing";
    router.push(url);
  }

  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <nav className="sticky top-0 z-30 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="font-display text-4xl font-semibold text-[#0D0D0D]">
            Paid
          </Link>
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
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/pricing"
                className="rounded-md bg-[#1B4332] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Start free trial
              </Link>
              <button
                type="button"
                onClick={() => setSignInOpen(true)}
                className="text-sm text-[#0D0D0D] hover:text-[#1B4332]"
              >
                Sign in
              </button>
            </div>
          )}
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden py-16 md:py-24">
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
          <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-14 px-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
            <SectionReveal>
              <div>
                <p className="mb-6 text-sm uppercase tracking-[0.22em] text-[#1B4332]">AI Receivables</p>
                <h1 className="font-display text-[3.2rem] leading-[0.92] tracking-tight text-[#0D0D0D] sm:text-[4.4rem] lg:text-7xl">
                  You did the work.
                  <br />
                  We&apos;ll get you paid.
                </h1>
                <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[#6B6B6B]">
                  Paid syncs your invoices and sends AI-drafted payment reminders from your real email —
                  automatically, in your voice.
                </p>
                <HeroPricingCards />
                <div className="mt-8">
                  <a href="#how-it-works" className="text-sm text-[#0D0D0D] hover:text-[#1B4332]">
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

        <section className="bg-[#F7F7F5] py-24">
          <div className="mx-auto w-full max-w-[1200px] px-6">
            <SectionReveal>
              <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Testimonials</p>
              <h2 className="mt-3 font-display text-5xl text-[#0D0D0D]">What firms say after switching to Paid</h2>
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
                  <article key={t.name} className="border border-[#E5E5E5] bg-white p-6">
                    <p className="font-display text-5xl leading-none text-[#1B4332]">“</p>
                    <p className="mt-4 font-display text-xl leading-relaxed text-[#0D0D0D]">{t.quote}</p>
                    <p className="mt-6 text-sm font-semibold text-[#0D0D0D]">{t.name}</p>
                    <p className="mt-1 text-sm text-[#6B6B6B]">{t.title}</p>
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

        <section className="py-24">
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
                  <p
                    key={line}
                    className="relative overflow-hidden border-b border-[#E5E5E5] py-5 pl-10 text-sm text-[#0D0D0D] transition hover:text-[#1B4332]"
                  >
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

        <p className="mx-auto max-w-[1200px] px-6 pb-4 text-center text-sm text-[#6B6B6B]">
          Both plans include a 30-day free trial. No charge until day 31.
        </p>

        <section className="border-t border-[#E5E5E5] bg-[#F7F7F5] py-24">
          <div className="mx-auto max-w-xl px-6 text-center">
            <SectionReveal>
              <h2 className="font-display text-4xl text-[#0D0D0D] md:text-5xl">Ready to get paid?</h2>
              <p className="mt-4 text-sm text-[#6B6B6B]">Start your free trial — pick a plan on the next step.</p>
              <form onSubmit={onCtaSubmit} className="mx-auto mt-10 flex max-w-lg flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={ctaEmail}
                  onChange={(e) => setCtaEmail(e.target.value)}
                  placeholder="you@firm.com"
                  className="min-h-[48px] flex-1 border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#0D0D0D] outline-none focus:border-[#1B4332]"
                  aria-label="Work email"
                />
                <button
                  type="submit"
                  className="rounded-md bg-[#1B4332] px-6 py-3 text-sm font-medium text-white hover:opacity-95"
                >
                  Start free trial
                </button>
              </form>
            </SectionReveal>
          </div>
        </section>

        <footer className="border-t border-[#E5E5E5] py-12">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-6">
              <span className="font-display text-2xl text-[#0D0D0D]">Paid</span>
              <Link href="/privacy" className="text-sm text-[#6B6B6B] hover:text-[#0D0D0D]">
                Privacy
              </Link>
              <Link href="/terms" className="text-sm text-[#6B6B6B] hover:text-[#0D0D0D]">
                Terms
              </Link>
            </div>
            <p className="text-sm text-[#6B6B6B]">You did the work. We&apos;ll get you paid.</p>
          </div>
        </footer>
      </main>

      <AuthSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}

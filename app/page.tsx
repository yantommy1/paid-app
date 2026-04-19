import Link from "next/link";
import { LandingEmailForm } from "@/components/LandingEmailForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
      <header className="mb-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paid-brand text-sm font-bold text-white">
            P
          </span>
          <span className="text-lg font-semibold tracking-tight">Paid</span>
        </div>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-paid-brand hover:underline"
        >
          Sign in
        </Link>
      </header>

      <section className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-paid-brand">
            B2B · Professional services
          </p>
          <h1 className="mb-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Get paid without the awkward follow-ups.
          </h1>
          <p className="mb-8 text-lg leading-relaxed text-slate-600">
            Paid connects QuickBooks and Gmail, then drafts human-sounding payment
            reminders so you stay on top of overdue invoices—without sounding like
            a robot.
          </p>
          <ul className="mb-10 space-y-3 text-slate-700">
            <li className="flex gap-2">
              <span className="text-paid-accent">✓</span>
              AI reminders tuned for 30, 60, and 90+ day overdue tiers
            </li>
            <li className="flex gap-2">
              <span className="text-paid-accent">✓</span>
              Sends from your real Gmail address
            </li>
            <li className="flex gap-2">
              <span className="text-paid-accent">✓</span>
              Gmail Workspace Add-On for inbox context
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">
            Start at getpaid.ai
          </h2>
          <p className="mb-6 text-sm text-slate-600">
            Enter your work email. We&apos;ll send a magic link to continue setup.
          </p>
          <LandingEmailForm />
        </div>
      </section>
    </main>
  );
}

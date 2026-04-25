"use client";

import Link from "next/link";
import { useMemo } from "react";

function CheckIcon() {
  return (
    <svg
      className="h-20 w-20 shrink-0"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="40" cy="40" r="38" stroke="#1B4332" strokeWidth="2" />
      <path
        d="M24 40.5L35.5 52L56 30"
        stroke="#1B4332"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SubscriptionSuccessPage() {
  const trialEndsDisplay = useMemo(
    () =>
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <nav className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-3xl text-[#0D0D0D]">
            Paid
          </Link>
          <Link href="/dashboard" className="text-sm text-[#6B6B6B] hover:text-[#0D0D0D]">
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-xl px-6 py-16 md:py-20">
        <div className="flex flex-col items-center text-center">
          <CheckIcon />
          <h1 className="mt-8 font-display text-4xl text-[#0D0D0D] md:text-5xl">
            You&apos;re all set.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[#6B6B6B]" suppressHydrationWarning>
            Your 30-day free trial has started. You won&apos;t be billed until {trialEndsDisplay}.
            We&apos;ll send a reminder before your trial ends.
          </p>

          <ul className="mt-10 w-full max-w-md space-y-3 text-left text-sm text-[#0D0D0D]">
            <li className="flex gap-3 border-b border-[#E5E5E5] pb-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B4332]" aria-hidden />
              QuickBooks connected and syncing
            </li>
            <li className="flex gap-3 border-b border-[#E5E5E5] pb-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B4332]" aria-hidden />
              Gmail connected and ready to send
            </li>
            <li className="flex gap-3 pb-1">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B4332]" aria-hidden />
              AI reminders active
            </li>
          </ul>

          <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center border border-[#E5E5E5] bg-white px-5 py-3 text-sm font-medium text-[#0D0D0D] hover:bg-[#F7F7F5]"
            >
              Open Gmail
            </a>
            <Link
              href="/dashboard"
              className="inline-flex flex-1 items-center justify-center bg-[#1B4332] px-5 py-3 text-sm font-medium text-white hover:opacity-95"
            >
              Go to dashboard
            </Link>
          </div>

          <p className="mt-12 max-w-md text-center text-xs leading-relaxed text-[#6B6B6B]">
            A confirmation has been sent to your email. Manage your subscription anytime in Settings.
          </p>
        </div>
      </div>
    </main>
  );
}

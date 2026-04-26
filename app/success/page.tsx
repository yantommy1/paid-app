import Link from "next/link";
import { getStripe } from "@/lib/stripe/connect";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trial Started — Paid",
  description: "Your Paid trial is active. Check your inbox for a sign-in link to finish setup.",
};

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

export default async function SubscriptionSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = (params.session_id ?? "").trim();

  let customerEmail = "";
  let trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (sessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      customerEmail =
        session.customer_details?.email ??
        session.customer_email ??
        session.metadata?.checkout_email ??
        "";
      const sub = session.subscription;
      if (sub && typeof sub !== "string" && sub.trial_end) {
        trialEndDate = new Date(sub.trial_end * 1000);
      }
    } catch {
      // keep default view when session cannot be fetched
    }
  }

  const trialEndsDisplay = trialEndDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto max-w-xl px-6 py-16 md:py-20">
        <div className="flex flex-col items-center text-center">
          <CheckIcon />
          <h1 className="mt-8 font-display text-4xl text-[#0D0D0D] md:text-5xl">
            Your trial has started.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[#6B6B6B]">
            We sent a sign-in link to{" "}
            <span className="font-medium text-[#0D0D0D]">{customerEmail || "your email"}</span>.
            Click it to set up your account and start collecting overdue invoices.
          </p>
          <p className="mt-4 text-sm text-[#6B6B6B]">Trial ends on {trialEndsDisplay}</p>

          <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex flex-1 items-center justify-center border border-[#E5E5E5] bg-white px-5 py-3 text-sm font-medium text-[#0D0D0D] hover:bg-[#F7F7F5]"
            >
              Back to home
            </Link>
          </div>

          <p className="mt-12 max-w-md text-center text-xs leading-relaxed text-[#6B6B6B]">
            Didn&apos;t get the email? Check spam, then start a new trial flow with the same address.
          </p>
        </div>
      </div>
    </main>
  );
}

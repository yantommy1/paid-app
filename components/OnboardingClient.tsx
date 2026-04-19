"use client";

import { createClient } from "@/lib/supabase/browser";
import { SyncInvoicesSection } from "@/components/SyncInvoicesSection";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MARKETPLACE_URL =
  "https://workspace.google.com/marketplace/app/your_paid_add_on_id";

type Props = {
  initialStep?: string;
  email: string;
};

export function OnboardingClient({ initialStep, email }: Props) {
  const router = useRouter();

  const step =
    initialStep === "quickbooks-done"
      ? 2
      : initialStep === "gmail-done"
        ? 3
        : initialStep === "stripe-done"
          ? 4
          : 1;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-slate-500">Signed in as {email}</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm text-paid-brand hover:underline"
          >
            Sign out
          </button>
          <Link href="/dashboard" className="text-sm font-medium text-paid-brand hover:underline">
            Dashboard
          </Link>
        </div>
      </div>

      <SyncInvoicesSection autoSyncOnMount={initialStep === "gmail-done"} />

      <ol className="space-y-8">
        <li
          className={`rounded-xl border p-6 ${step >= 1 ? "border-paid-brand/40 bg-white" : "border-slate-200"}`}
        >
          <span className="text-xs font-semibold uppercase text-paid-brand">
            Step 1
          </span>
          <h2 className="mt-1 text-lg font-semibold">Connect QuickBooks</h2>
          <p className="mt-2 text-sm text-slate-600">
            Authorize read access to unpaid invoices. We sync balances daily.
          </p>
          <a
            href="/api/auth/quickbooks"
            className="mt-4 inline-block rounded-lg bg-paid-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Connect QuickBooks
          </a>
        </li>

        <li
          className={`rounded-xl border p-6 ${step >= 2 ? "border-paid-brand/40 bg-white" : "border-slate-200"}`}
        >
          <span className="text-xs font-semibold uppercase text-paid-brand">
            Step 2
          </span>
          <h2 className="mt-1 text-lg font-semibold">Connect Gmail</h2>
          <p className="mt-2 text-sm text-slate-600">
            Allow sending reminders from your real address (Gmail send scope).
          </p>
          <a
            href="/api/auth/gmail"
            className="mt-4 inline-block rounded-lg bg-paid-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Connect Gmail
          </a>
        </li>

        <li
          className={`rounded-xl border p-6 ${step >= 3 ? "border-paid-brand/40 bg-white" : "border-slate-200"}`}
        >
          <span className="text-xs font-semibold uppercase text-paid-brand">
            Step 3
          </span>
          <h2 className="mt-1 text-lg font-semibold">Install the Gmail Add-On</h2>
          <p className="mt-2 text-sm text-slate-600">
            Install from Google Workspace Marketplace to see invoices in Gmail.
          </p>
          <Link
            href={MARKETPLACE_URL}
            target="_blank"
            className="mt-4 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Open Marketplace listing
          </Link>
          <p className="mt-4 text-sm text-slate-600">
            After install, open Gmail → right sidebar → Paid. Link your account by
            visiting{" "}
            <Link href="/api/auth/session-token" className="text-paid-brand underline">
              session token
            </Link>{" "}
            (copy the JWT for the Add-On script).
          </p>
        </li>

        <li className="rounded-xl border border-slate-200 p-6">
          <span className="text-xs font-semibold uppercase text-paid-brand">
            Step 4
          </span>
          <h2 className="mt-1 text-lg font-semibold">Stripe Connect (optional)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Route payments through Stripe to split contingency fees automatically.
          </p>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/stripe/connect", { method: "POST" });
              const j = (await res.json()) as { url?: string };
              if (ok(res) && j.url) window.location.href = j.url;
            }}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Start Stripe onboarding
          </button>
        </li>
      </ol>
    </div>
  );
}

function ok(res: Response) {
  return res.ok;
}

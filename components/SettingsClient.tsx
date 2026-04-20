"use client";

import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const GMAIL_ADDON_INSTALL_URL =
  "https://script.google.com/macros/s/AKfycbziHm_MsqZ3dRjMoDyKgHUYpkTATh7Bu4B7f82YD8l9/exec";

type Props = {
  email: string;
  quickbooksConnected: boolean;
  gmailConnected: boolean;
  quickbooksRealmId: string | null;
};

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        connected ? "bg-[#00E5A0]" : "bg-red-500"
      }`}
      aria-hidden
    />
  );
}

export function SettingsClient({
  email,
  quickbooksConnected: qbInitial,
  gmailConnected: gmInitial,
  quickbooksRealmId,
}: Props) {
  const router = useRouter();
  const [qbConn, setQbConn] = useState(qbInitial);
  const [gmConn, setGmConn] = useState(gmInitial);
  const [qbBusy, setQbBusy] = useState(false);
  const [gmBusy, setGmBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  useEffect(() => {
    setQbConn(qbInitial);
    setGmConn(gmInitial);
  }, [qbInitial, gmInitial]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function disconnectQuickBooks() {
    setQbBusy(true);
    try {
      const res = await fetch("/api/auth/quickbooks", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Could not disconnect.");
      }
      setQbConn(false);
      router.refresh();
    } finally {
      setQbBusy(false);
    }
  }

  async function disconnectGmail() {
    setGmBusy(true);
    try {
      const res = await fetch("/api/auth/gmail", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Could not disconnect.");
      }
      setGmConn(false);
      router.refresh();
    } finally {
      setGmBusy(false);
    }
  }

  async function generateConnectionKey() {
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      const res = await fetch("/api/auth/api-key", { method: "POST" });
      const j = (await res.json()) as { api_key?: string; error?: string };
      if (!res.ok) {
        setKeyMessage(j.error ?? "Could not generate a key. Try again.");
        return;
      }
      if (j.api_key) {
        try {
          await navigator.clipboard.writeText(j.api_key);
        } catch {
          setKeyMessage(
            "Key created but could not copy automatically — check browser permissions."
          );
          return;
        }
        setKeyMessage(
          "Key copied to clipboard — paste it into the Paid sidebar in Gmail"
        );
      }
    } catch {
      setKeyMessage("Something went wrong. Try again.");
    } finally {
      setKeyBusy(false);
    }
  }

  const cardClass =
    "rounded-xl border border-white/[0.1] bg-white/[0.02] p-6";

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 border-b border-white/[0.08] pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-4">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-paid-mist transition hover:text-[#00E5A0]"
          >
            Paid
          </Link>
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-paid-mist/70 transition hover:text-[#00E5A0]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to dashboard
            </Link>
          </div>
          <p className="text-sm text-paid-mist/55">
            Signed in as <span className="text-paid-mist/90">{email}</span>
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
          Integrations
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-paid-mist">
                  QuickBooks
                </h3>
                <p className="mt-2 flex items-center gap-2 text-sm text-paid-mist/65">
                  <StatusDot connected={qbConn} />
                  {qbConn ? (
                    <span className="text-[#00E5A0]/95">Connected</span>
                  ) : (
                    <span className="text-red-400/95">Disconnected</span>
                  )}
                </p>
                {qbConn && quickbooksRealmId && (
                  <p className="mt-3 font-mono text-xs text-paid-mist/45">
                    Company realm: {quickbooksRealmId}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6">
              {qbConn ? (
                <button
                  type="button"
                  disabled={qbBusy}
                  onClick={() => void disconnectQuickBooks()}
                  className="rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {qbBusy ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href="/api/auth/quickbooks?return_to=/settings"
                  className="inline-block rounded-lg bg-[#00E5A0] px-4 py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110"
                >
                  Connect QuickBooks
                </a>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-paid-mist">Gmail</h3>
                <p className="mt-2 flex items-center gap-2 text-sm text-paid-mist/65">
                  <StatusDot connected={gmConn} />
                  {gmConn ? (
                    <span className="text-[#00E5A0]/95">Connected</span>
                  ) : (
                    <span className="text-red-400/95">Disconnected</span>
                  )}
                </p>
                {gmConn && (
                  <p className="mt-3 text-xs leading-relaxed text-paid-mist/50">
                    Gmail send access is authorized for your Google account.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6">
              {gmConn ? (
                <button
                  type="button"
                  disabled={gmBusy}
                  onClick={() => void disconnectGmail()}
                  className="rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {gmBusy ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href="/api/auth/gmail?return_to=/settings"
                  className="inline-block rounded-lg bg-[#00E5A0] px-4 py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110"
                >
                  Connect Gmail
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <h3 className="font-display text-lg text-paid-mist">Gmail Add-On</h3>
        <a
          href={GMAIL_ADDON_INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#00E5A0] px-5 py-3 text-sm font-semibold text-paid-ink transition hover:brightness-110 sm:w-auto"
        >
          Install Gmail Add-On
        </a>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-paid-mist/45">
          <li>Click Install Gmail Add-On above</li>
          <li>Open Gmail — look for the Paid icon in the right sidebar</li>
          <li>
            Enter https://paid-app.com as the API base and paste your connection
            key below
          </li>
        </ol>
        <button
          type="button"
          disabled={keyBusy}
          onClick={() => void generateConnectionKey()}
          className="mt-6 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0] disabled:opacity-50"
        >
          {keyBusy ? "Generating…" : "Generate connection key"}
        </button>
        {keyMessage && (
          <p
            className={`mt-4 text-sm ${
              keyMessage.startsWith("Key copied")
                ? "text-[#00E5A0]/90"
                : "text-red-400/90"
            }`}
            role={keyMessage.startsWith("Key copied") ? "status" : "alert"}
          >
            {keyMessage}
          </p>
        )}
      </section>

      <div className="flex justify-start border-t border-white/[0.08] pt-10">
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

"use client";

import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
  const [apiBusy, setApiBusy] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setQbConn(qbInitial);
    setGmConn(gmInitial);
  }, [qbInitial, gmInitial]);

  const refreshStatus = useCallback(() => {
    void fetch("/api/user/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          quickbooksConnected?: boolean;
          gmailConnected?: boolean;
        } | null) => {
          if (!data) return;
          if (typeof data.quickbooksConnected === "boolean") {
            setQbConn(data.quickbooksConnected);
          }
          if (typeof data.gmailConnected === "boolean") {
            setGmConn(data.gmailConnected);
          }
        }
      )
      .catch(() => {});
  }, []);

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

  async function regenerateApiKey() {
    setApiBusy(true);
    setApiKeyMessage(null);
    setNewApiKey(null);
    try {
      const res = await fetch("/api/auth/api-key", { method: "POST" });
      const j = (await res.json()) as { api_key?: string; error?: string };
      if (!res.ok) {
        setApiKeyMessage(j.error ?? "Could not create a new key.");
        return;
      }
      if (j.api_key) {
        setNewApiKey(j.api_key);
        setApiKeyMessage(
          "New API key generated. Copy it now — it won’t be shown again in full."
        );
      }
    } catch {
      setApiKeyMessage("Something went wrong. Try again.");
    } finally {
      setApiBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/user/account", { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(j.error ?? "Could not delete account.");
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      setDeleteOpen(false);
      router.push("/");
      router.refresh();
    } catch {
      setDeleteError("Something went wrong. Try again.");
    } finally {
      setDeleteBusy(false);
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
        <h3 className="font-display text-lg text-paid-mist">Gmail add-on</h3>
        <p className="mt-3 text-sm leading-relaxed text-paid-mist/60">
          Install the Paid add-on from the Google Workspace Marketplace (or your
          admin-provided link), open Gmail, then in the add-on sidebar choose{" "}
          <span className="text-paid-mist/85">Settings</span> and paste your Paid
          API key when prompted. The add-on uses the same account as this
          dashboard.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={apiBusy}
            onClick={() => void regenerateApiKey()}
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0] disabled:opacity-50"
          >
            {apiBusy ? "Generating…" : "Regenerate API key"}
          </button>
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-paid-mist/75 transition hover:bg-white/[0.04]"
          >
            Refresh status
          </button>
        </div>
        {apiKeyMessage && (
          <p className="mt-4 text-sm text-paid-mist/70">{apiKeyMessage}</p>
        )}
        {newApiKey && (
          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-4">
            <p className="font-mono text-xs text-paid-mist/50">API key</p>
            <p className="mt-2 break-all font-mono text-sm text-[#00E5A0]">
              {newApiKey}
            </p>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-[#00E5A0] hover:underline"
              onClick={() => {
                void navigator.clipboard.writeText(newApiKey);
              }}
            >
              Copy to clipboard
            </button>
          </div>
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

      <section className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-6">
        <h3 className="font-display text-lg text-red-300/95">Danger zone</h3>
        <p className="mt-2 text-sm text-paid-mist/55">
          Permanently delete your Paid account and associated data. This cannot be
          undone.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="mt-5 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
        >
          Delete account
        </button>
      </section>

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0A0A0F] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
            <h4
              id="delete-dialog-title"
              className="font-display text-xl text-paid-mist"
            >
              Delete your account?
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-paid-mist/60">
              All invoices, reminders, and integration tokens will be removed. This
              action is permanent.
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-red-400">{deleteError}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-paid-mist/85 transition hover:bg-white/[0.04] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void deleteAccount()}
                className="rounded-lg border border-red-500/50 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

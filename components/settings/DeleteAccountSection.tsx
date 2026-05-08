"use client";

import { useState } from "react";

type Props = {
  userEmail: string;
  onDeleted: () => void | Promise<void>;
};

/**
 * Privacy policy + Limited Use disclosure commit to user-initiated deletion.
 * The endpoint cascades the auth row, which removes every public table row
 * referencing the user, and best-effort revokes Google + QuickBooks tokens.
 *
 * Confirmation pattern: the user must type their exact email (case-insensitive)
 * before the destructive button enables. Same shape as GitHub repo delete.
 */
export function DeleteAccountSection({ userEmail, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches =
    typed.trim().toLowerCase() === (userEmail ?? "").trim().toLowerCase() &&
    typed.length > 0;

  async function handleDelete() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_email: typed.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(j?.error ?? "Could not delete the account. Try again.");
        return;
      }
      await onDeleted();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-red-200 bg-red-50/40 px-6 py-10">
      <h2 className="font-display text-2xl text-red-700">Delete account</h2>
      <p className="mt-2 max-w-2xl text-sm text-[#6B6B6B]">
        Permanently delete your Paid account and every record we hold for you —
        invoices, reminder logs, classifications, scheduled follow-ups, bookkeeper
        invites, and your connection key. We will also revoke your Gmail and
        QuickBooks tokens at the issuer. This cannot be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 border border-red-600 bg-white px-4 py-2 text-sm font-medium text-red-600"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-5 max-w-md space-y-3">
          <label className="block text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">
            Type your email to confirm
          </label>
          <input
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={userEmail || "your-email@example.com"}
            className="w-full border border-[#E5E5E5] bg-white px-3 py-2 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!matches || busy}
              onClick={() => void handleDelete()}
              className="bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Permanently delete account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={busy}
              className="border border-[#1B4332] px-4 py-2 text-sm text-[#1B4332]"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}

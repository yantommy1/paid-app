"use client";

import { useEffect, useState } from "react";

type Invite = {
  id: string;
  bookkeeper_email: string;
  permissions: "review" | "send";
  accepted_at: string | null;
  last_access_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
};

export function BookkeeperShareSection() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<"review" | "send">("send");
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/bookkeeper/invites");
      const j = (await res.json()) as { invites?: Invite[] };
      setInvites(j.invites ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite() {
    setMessage(null);
    setLastLink(null);
    if (!email.trim()) {
      setMessage("Enter an email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/bookkeeper/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookkeeper_email: email.trim(),
          permissions,
          send_email: sendEmail,
        }),
      });
      const j = (await res.json()) as { invite?: { link: string }; error?: string };
      if (!res.ok || !j.invite) {
        setMessage(j.error ?? "Could not create invite.");
      } else {
        setLastLink(j.invite.link);
        setMessage(sendEmail ? "Invite created and email sent." : "Invite created. Copy the link below.");
        setEmail("");
        await load();
      }
    } catch {
      setMessage("Could not create invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch("/api/bookkeeper/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function copyLink(link: string) {
    void navigator.clipboard.writeText(link);
    setMessage("Link copied.");
  }

  return (
    <section className="border-t border-[#E5E5E5] py-10">
      <h2 className="font-display text-2xl text-[#0D0D0D]">Send to bookkeeper</h2>
      <p className="mt-2 max-w-2xl text-sm text-[#6B6B6B]">
        Share your overdue invoices and AI-drafted reminders with your bookkeeper. They get a magic link to review (and optionally approve and send) reminders without seeing your settings or disconnecting any integrations.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_180px_140px_120px]">
        <input
          type="email"
          placeholder="bookkeeper@firm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-[#E5E5E5] px-3 py-2 text-sm"
        />
        <select
          value={permissions}
          onChange={(e) => setPermissions(e.target.value as "review" | "send")}
          className="border border-[#E5E5E5] px-3 py-2 text-sm"
        >
          <option value="send">Review + send</option>
          <option value="review">Read only</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-[#0D0D0D]">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          Email the link
        </label>
        <button
          type="button"
          onClick={() => void invite()}
          disabled={busy}
          className="bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Working…" : "Invite"}
        </button>
      </div>

      {lastLink && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3">
          <span className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Magic link</span>
          <code className="font-mono text-xs break-all text-[#0D0D0D]">{lastLink}</code>
          <button
            type="button"
            onClick={() => copyLink(lastLink)}
            className="border border-[#1B4332] px-3 py-1 text-xs text-[#1B4332]"
          >
            Copy
          </button>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-[#6B6B6B]">{message}</p>}

      <div className="mt-8">
        <h3 className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Active invites</h3>
        {loading ? (
          <p className="mt-3 text-sm text-[#6B6B6B]">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="mt-3 text-sm text-[#6B6B6B]">No active invites yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#E5E5E5] border border-[#E5E5E5]">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm text-[#0D0D0D]">{inv.bookkeeper_email}</p>
                  <p className="text-xs text-[#6B6B6B]">
                    {inv.permissions === "send" ? "Review + send" : "Read only"}
                    {inv.revoked_at
                      ? " · revoked"
                      : inv.accepted_at
                        ? ` · last access ${inv.last_access_at ?? inv.accepted_at}`
                        : " · pending"}
                  </p>
                </div>
                {!inv.revoked_at && (
                  <button
                    type="button"
                    onClick={() => void revoke(inv.id)}
                    disabled={busy}
                    className="border border-red-600 px-3 py-1 text-xs text-red-600 disabled:opacity-60"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

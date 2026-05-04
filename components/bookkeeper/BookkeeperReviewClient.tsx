"use client";

import { useState } from "react";

type InvoiceItem = {
  id: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  status: string;
  reminderSentAt: string | null;
  reminderPending: boolean;
  reminderDraft: string | null;
  quickbooksInvoiceId: string;
};

type DraftCache = {
  subject: string;
  body: string;
  tone?: string;
  payNowIncluded?: boolean;
};

function parseDraft(raw: string | null): DraftCache | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraftCache;
  } catch {
    return null;
  }
}

export function BookkeeperReviewClient({
  token,
  ownerEmail,
  bookkeeperEmail,
  permissions,
  invoices,
}: {
  token: string;
  ownerEmail: string | null;
  bookkeeperEmail: string;
  permissions: "review" | "send";
  invoices: InvoiceItem[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftCache>>(() => {
    const initial: Record<string, DraftCache> = {};
    for (const inv of invoices) {
      const cached = parseDraft(inv.reminderDraft);
      if (cached) initial[inv.id] = cached;
    }
    return initial;
  });
  const [busy, setBusy] = useState<Record<string, "drafting" | "sending" | null>>({});
  const [sent, setSent] = useState<Record<string, true>>({});
  const [error, setError] = useState<Record<string, string | null>>({});

  async function generateDraft(invoiceId: string) {
    setBusy((b) => ({ ...b, [invoiceId]: "drafting" }));
    setError((e) => ({ ...e, [invoiceId]: null }));
    try {
      const res = await fetch(`/api/bookkeeper/${encodeURIComponent(token)}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const j = (await res.json()) as DraftCache & { error?: string };
      if (!res.ok || !j.subject) {
        setError((e) => ({ ...e, [invoiceId]: j.error ?? "Could not draft" }));
      } else {
        setDrafts((d) => ({ ...d, [invoiceId]: { subject: j.subject, body: j.body, tone: j.tone, payNowIncluded: j.payNowIncluded } }));
      }
    } catch {
      setError((e) => ({ ...e, [invoiceId]: "Network error" }));
    } finally {
      setBusy((b) => ({ ...b, [invoiceId]: null }));
    }
  }

  async function approveAndSend(invoiceId: string) {
    if (permissions !== "send") return;
    const draft = drafts[invoiceId];
    if (!draft) return;
    setBusy((b) => ({ ...b, [invoiceId]: "sending" }));
    setError((e) => ({ ...e, [invoiceId]: null }));
    try {
      const res = await fetch(`/api/bookkeeper/${encodeURIComponent(token)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          subject: draft.subject,
          body: draft.body,
          tone: draft.tone,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError((e) => ({ ...e, [invoiceId]: j.error ?? "Send failed" }));
      } else {
        setSent((s) => ({ ...s, [invoiceId]: true }));
      }
    } catch {
      setError((e) => ({ ...e, [invoiceId]: "Network error" }));
    } finally {
      setBusy((b) => ({ ...b, [invoiceId]: null }));
    }
  }

  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="border-b border-[#E5E5E5] bg-[#F0F7F4]">
        <div className="mx-auto max-w-[1100px] px-6 py-10">
          <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Bookkeeper review</p>
          <h1 className="mt-2 font-display text-4xl">{ownerEmail ? `${ownerEmail}'s overdue invoices` : "Overdue invoices"}</h1>
          <p className="mt-3 text-sm text-[#6B6B6B]">
            Signed in as {bookkeeperEmail}. {permissions === "send" ? "You can review drafts and approve them — the owner gets a one-click send in their Gmail." : "You can review drafts (read only)."}
          </p>
          <div className="mt-6 inline-flex items-baseline gap-2 border border-[#E5E5E5] bg-white px-4 py-3">
            <span className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Total outstanding</span>
            <span className="font-display text-2xl text-[#0D0D0D]">
              ${totalOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs text-[#6B6B6B]">across {invoices.length} invoices</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-10">
        {invoices.length === 0 ? (
          <p className="text-sm text-[#6B6B6B]">No overdue invoices right now. Nice.</p>
        ) : (
          <ul className="divide-y divide-[#E5E5E5] border border-[#E5E5E5]">
            {invoices.map((inv) => {
              const isOpen = openId === inv.id;
              const draft = drafts[inv.id];
              const isBusy = busy[inv.id];
              const wasSent = sent[inv.id];
              const err = error[inv.id];
              return (
                <li key={inv.id} className="bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#FAFAFA]"
                    onClick={() => setOpenId(isOpen ? null : inv.id)}
                  >
                    <div>
                      <p className="text-sm font-medium text-[#0D0D0D]">{inv.clientName}</p>
                      <p className="text-xs text-[#6B6B6B]">
                        Invoice {inv.quickbooksInvoiceId} · due {inv.dueDate} · {inv.daysOverdue} days overdue
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-[#0D0D0D]">
                        ${inv.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-xs text-[#6B6B6B]">{isOpen ? "Hide" : "Review"}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#E5E5E5] bg-[#FAFAFA] px-5 py-5">
                      {wasSent ? (
                        <p className="text-sm text-[#1B4332]">Approved. The owner will see this in their Paid Gmail Add-On and click Send when ready.</p>
                      ) : draft ? (
                        <>
                          <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Subject</p>
                          <p className="mt-1 text-sm text-[#0D0D0D]">{draft.subject}</p>
                          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Body</p>
                          <pre className="mt-1 whitespace-pre-wrap text-sm text-[#0D0D0D]">{draft.body}</pre>
                          {draft.tone && (
                            <p className="mt-3 text-xs text-[#6B6B6B]">Tone: <span className="capitalize">{draft.tone}</span>{draft.payNowIncluded ? " · Pay Now button included" : ""}</p>
                          )}
                          <div className="mt-5 flex flex-wrap items-center gap-3">
                            {permissions === "send" ? (
                              <button
                                type="button"
                                disabled={isBusy === "sending"}
                                onClick={() => void approveAndSend(inv.id)}
                                className="bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                              >
                                {isBusy === "sending" ? "Approving…" : `Approve for owner to send`}
                              </button>
                            ) : (
                              <span className="text-xs text-[#6B6B6B]">Read-only access — only the owner can approve drafts.</span>
                            )}
                            <button
                              type="button"
                              disabled={isBusy === "drafting"}
                              onClick={() => void generateDraft(inv.id)}
                              className="border border-[#1B4332] px-4 py-2 text-sm text-[#1B4332] disabled:opacity-60"
                            >
                              {isBusy === "drafting" ? "Re-drafting…" : "Re-draft"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy === "drafting"}
                          onClick={() => void generateDraft(inv.id)}
                          className="bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {isBusy === "drafting" ? "Drafting…" : "Generate draft"}
                        </button>
                      )}
                      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

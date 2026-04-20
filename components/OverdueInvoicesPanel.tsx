"use client";

import {
  cohortForInvoice,
  computeSidebarHeader,
  type CohortKey,
} from "@/lib/invoices/sidebar-stats";
import { useCallback, useEffect, useState } from "react";

type Invoice = {
  id: string;
  client_name: string;
  client_email: string;
  amount: number;
  days_overdue: number;
  status: string;
  quickbooks_invoice_id: string;
  due_date: string;
  reminder_sent_at: string | null;
};

type DraftState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; subject: string; body: string }
  | { status: "error"; message: string };

const MSG_RECONNECT_QB =
  "Reconnect QuickBooks in Settings to sync invoices.";
const MSG_RECONNECT_GMAIL =
  "Reconnect Gmail in Settings to send reminders.";

/** Avoid showing API paths, env keys, or stack details to end users. */
function userFacingError(raw: string | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (/anthropic|\/api\/|\.env|localhost|stack trace|internal server/i.test(t)) {
    return fallback;
  }
  if (t.length > 280) return fallback;
  return t;
}

function syncIntegrationMessage(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return MSG_RECONNECT_QB;
  const t = raw.toLowerCase();
  if (
    t.includes("quickbooks not connected") ||
    t.includes("quickbooks token invalid") ||
    (t.includes("quickbooks") && t.includes("reconnect"))
  ) {
    return MSG_RECONNECT_QB;
  }
  return userFacingError(
    raw,
    "Sync failed. Check your QuickBooks connection and try again."
  );
}

function sendGmailIntegrationMessage(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return MSG_RECONNECT_GMAIL;
  const t = raw.toLowerCase();
  if (
    t.includes("gmail not connected") ||
    t.includes("token expired") ||
    (t.includes("gmail") && t.includes("reconnect"))
  ) {
    return MSG_RECONNECT_GMAIL;
  }
  return userFacingError(
    raw,
    "Could not send. Check your Gmail connection and try again."
  );
}

function reminderAlreadySent(inv: Invoice): boolean {
  return inv.status === "reminder_sent" || Boolean(inv.reminder_sent_at);
}

function formatSentAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

type ComposeState = {
  invoiceId: string;
  to: string;
  subject: string;
  body: string;
};

const COHORT_SECTIONS: { key: CohortKey; title: string }[] = [
  { key: "d90", title: "90+ days overdue" },
  { key: "d60", title: "60–90 days overdue" },
  { key: "d30", title: "30–60 days overdue" },
  { key: "current", title: "Current & upcoming" },
];

function groupByCohort(invoices: Invoice[]): Record<CohortKey, Invoice[]> {
  const empty: Record<CohortKey, Invoice[]> = {
    d90: [],
    d60: [],
    d30: [],
    current: [],
  };
  for (const inv of invoices) {
    empty[cohortForInvoice(inv)].push(inv);
  }
  return empty;
}

export function OverdueInvoicesPanel() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/invoices");
      const j = (await res.json()) as { invoices?: Invoice[]; error?: string };
      if (!res.ok) {
        setListError(
          userFacingError(
            typeof j.error === "string" ? j.error : undefined,
            "Could not load invoices. Try again."
          )
        );
        setInvoices([]);
        return;
      }
      setInvoices(j.invoices ?? []);
    } catch {
      setListError("Could not load invoices.");
      setInvoices([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const syncFromQuickBooks = useCallback(async () => {
    setSyncState("syncing");
    setSyncError(null);
    try {
      const res = await fetch("/api/invoices/sync", { method: "POST" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSyncState("error");
        setSyncError(
          syncIntegrationMessage(
            typeof j.error === "string" ? j.error : undefined
          )
        );
        return;
      }
      setSyncState("success");
      await loadInvoices();
      window.setTimeout(() => setSyncState("idle"), 4000);
    } catch {
      setSyncState("error");
      setSyncError("Network error. Try again.");
    }
  }, [loadInvoices]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  async function draftReminder(invoiceId: string) {
    setDrafts((d) => ({ ...d, [invoiceId]: { status: "loading" } }));
    try {
      const res = await fetch("/api/invoices/draft-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const j = (await res.json()) as {
        subject?: string;
        body?: string;
        error?: string;
      };
      if (!res.ok) {
        setDrafts((d) => ({
          ...d,
          [invoiceId]: {
            status: "error",
            message: userFacingError(
              typeof j.error === "string" ? j.error : undefined,
              "Could not draft reminder. Try again in a moment."
            ),
          },
        }));
        return;
      }
      if (j.subject && j.body) {
        setDrafts((d) => ({
          ...d,
          [invoiceId]: {
            status: "ok",
            subject: j.subject ?? "",
            body: j.body ?? "",
          },
        }));
      } else {
        setDrafts((d) => ({
          ...d,
          [invoiceId]: {
            status: "error",
            message: "Unexpected response. Try again.",
          },
        }));
      }
    } catch {
      setDrafts((d) => ({
        ...d,
        [invoiceId]: {
          status: "error",
          message: "Network error.",
        },
      }));
    }
  }

  async function sendReminder(invoiceId: string, subject: string, body: string) {
    setSendingId(invoiceId);
    try {
      const res = await fetch("/api/invoices/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          subject,
          body,
          channel: "web",
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setDrafts((d) => ({
          ...d,
          [invoiceId]: {
            status: "error",
            message: sendGmailIntegrationMessage(
              typeof j.error === "string" ? j.error : undefined
            ),
          },
        }));
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[invoiceId];
        return next;
      });
      setCompose((c) => (c?.invoiceId === invoiceId ? null : c));
      await loadInvoices();
    } catch {
      setDrafts((d) => ({
        ...d,
        [invoiceId]: {
          status: "error",
          message: "Network error.",
        },
      }));
    } finally {
      setSendingId(null);
    }
  }

  const header =
    invoices.length > 0 ? computeSidebarHeader(invoices) : null;
  const grouped = groupByCohort(invoices);

  if (loadingList) {
    return (
      <section className="mt-10 rounded-lg border border-white/[0.08] bg-white/[0.02] p-8">
        <p className="text-sm text-paid-mist/60">Loading invoices…</p>
      </section>
    );
  }

  if (listError) {
    return (
      <section className="mt-10 rounded-lg border border-red-500/30 bg-red-500/5 p-8">
        <p className="text-sm text-red-300">{listError}</p>
        <button
          type="button"
          onClick={() => void loadInvoices()}
          className="mt-4 text-sm font-medium text-[#00E5A0] hover:underline"
        >
          Try again
        </button>
      </section>
    );
  }

  const fieldClass =
    "w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-paid-mist outline-none placeholder:text-paid-mist/35 focus:border-[#00E5A0]/35 focus:ring-1 focus:ring-[#00E5A0]/20";

  return (
    <div className="mt-10 space-y-10">
      {compose && (
        <div
          className="fixed inset-0 z-50 flex flex-col border border-white/10 bg-[#0A0A0F] shadow-[0_8px_40px_rgba(0,0,0,0.6)] sm:inset-auto sm:bottom-6 sm:right-6 sm:left-auto sm:top-auto sm:h-auto sm:max-h-[80vh] sm:w-[560px] sm:rounded-lg"
          role="dialog"
          aria-labelledby="compose-modal-title"
          aria-modal="true"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#1a1a2e] px-4 py-3">
            <h2
              id="compose-modal-title"
              className="min-w-0 flex-1 truncate text-sm font-medium text-paid-mist"
              title={compose.subject}
            >
              {compose.subject || "(No subject)"}
            </h2>
            <button
              type="button"
              onClick={() => setCompose(null)}
              className="shrink-0 rounded p-1.5 text-paid-mist/60 transition hover:bg-white/5 hover:text-paid-mist"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:max-h-[calc(80vh-8rem)]">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-paid-mist/50">
                To
              </label>
              <input
                type="email"
                value={compose.to}
                onChange={(e) =>
                  setCompose((c) =>
                    c ? { ...c, to: e.target.value } : null
                  )
                }
                className={fieldClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-paid-mist/50">
                Subject
              </label>
              <input
                type="text"
                value={compose.subject}
                onChange={(e) =>
                  setCompose((c) =>
                    c ? { ...c, subject: e.target.value } : null
                  )
                }
                className={fieldClass}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-paid-mist/50">
                Body
              </label>
              <textarea
                value={compose.body}
                onChange={(e) =>
                  setCompose((c) =>
                    c ? { ...c, body: e.target.value } : null
                  )
                }
                rows={12}
                className={`min-h-[160px] flex-1 resize-y ${fieldClass} font-sans leading-relaxed`}
              />
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap gap-3 border-t border-white/10 bg-[#0A0A0F] p-4">
            <button
              type="button"
              disabled={sendingId === compose.invoiceId}
              onClick={() =>
                void sendReminder(
                  compose.invoiceId,
                  compose.subject,
                  compose.body
                )
              }
              className="rounded-md bg-[#00E5A0] px-4 py-2 text-sm font-semibold text-paid-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {sendingId === compose.invoiceId
                ? "Sending…"
                : "Send via Paid"}
            </button>
            <button
              type="button"
              disabled={sendingId === compose.invoiceId}
              onClick={() => setCompose(null)}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-paid-mist/85 transition hover:bg-white/[0.04] disabled:opacity-50"
            >
              Discard
            </button>
          </footer>
        </div>
      )}

      <section className="rounded-lg border border-white/[0.1] bg-white/[0.02] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                Total outstanding
              </p>
              <p className="mt-1 font-mono text-3xl tabular-nums text-paid-mist">
                $
                {header
                  ? header.totalOutstanding.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "0.00"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                Clients 30+ days overdue
              </p>
              <p className="mt-1 font-mono text-3xl tabular-nums text-paid-mist">
                {header ? header.overdueClientCount : 0}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void syncFromQuickBooks()}
              disabled={syncState === "syncing"}
              className="rounded-md bg-[#00E5A0] px-5 py-2.5 text-sm font-semibold text-paid-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {syncState === "syncing" ? "Syncing…" : "Sync invoices"}
            </button>
          </div>
        </div>
        {syncState === "success" && (
          <p className="mt-4 text-sm text-[#00E5A0]/90" role="status">
            Invoices synced successfully.
          </p>
        )}
        {syncState === "error" && syncError && (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {syncError}
          </p>
        )}
      </section>

      {invoices.length === 0 ? (
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-8">
          <h3 className="font-display text-xl text-paid-mist">No open invoices</h3>
          <p className="mt-2 text-sm leading-relaxed text-paid-mist/60">
            No open invoices found. Sync your QuickBooks account to get started.
          </p>
          <button
            type="button"
            onClick={() => void syncFromQuickBooks()}
            disabled={syncState === "syncing"}
            className="mt-6 text-sm font-medium text-[#00E5A0] hover:underline disabled:opacity-50"
          >
            {syncState === "syncing" ? "Syncing…" : "Sync invoices"}
          </button>
          {syncState === "success" && (
            <p className="mt-3 text-sm text-[#00E5A0]/90">Invoices synced successfully.</p>
          )}
        </section>
      ) : (
        COHORT_SECTIONS.map(({ key, title }) => {
          const list = grouped[key];
          if (!list.length) return null;
          return (
            <section key={key} className="space-y-4">
              <h3 className="border-b border-white/[0.08] pb-2 font-display text-lg text-paid-mist">
                {title}
              </h3>
              <ul className="space-y-4">
                {list.map((inv) => {
                  const draft = drafts[inv.id] ?? { status: "idle" as const };
                  const sent = reminderAlreadySent(inv);
                  return (
                    <li
                      key={inv.id}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium text-paid-mist">
                            {inv.client_name}
                          </p>
                          <p className="font-mono text-lg tabular-nums text-paid-mist">
                            $
                            {Number(inv.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-sm text-paid-mist/55">
                            {inv.days_overdue > 0
                              ? `${inv.days_overdue} days overdue`
                              : "Not overdue yet"}
                            {" · "}
                            Due {formatDue(inv.due_date)}
                          </p>
                          <p className="font-mono text-xs text-paid-mist/45">
                            Invoice #{inv.quickbooks_invoice_id}
                          </p>
                        </div>
                        {!sent && (
                          <button
                            type="button"
                            onClick={() => void draftReminder(inv.id)}
                            disabled={draft.status === "loading"}
                            className="shrink-0 rounded-md border border-[#00E5A0]/40 px-4 py-2 text-sm font-semibold text-[#00E5A0] transition hover:bg-[#00E5A0]/10 disabled:opacity-50"
                          >
                            {draft.status === "loading"
                              ? "Drafting…"
                              : "Draft reminder"}
                          </button>
                        )}
                      </div>

                      {sent && (
                        <div
                          className="mt-4 rounded-md border border-[#00E5A0]/25 bg-[#00E5A0]/5 px-4 py-3 text-sm text-[#00E5A0]/95"
                          role="status"
                        >
                          <strong>Reminder sent</strong>
                          {inv.reminder_sent_at && (
                            <>
                              {" "}
                              {formatSentAt(inv.reminder_sent_at)} ·{" "}
                              {inv.client_email}
                            </>
                          )}
                        </div>
                      )}

                      {draft.status === "ok" && !sent && (
                        <div className="mt-4 space-y-4 border-t border-white/[0.06] pt-4">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                              Subject
                            </p>
                            <p className="mt-1 text-sm text-paid-mist">
                              {draft.subject}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                              Body
                            </p>
                            <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-paid-mist/85">
                              {draft.body}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={sendingId === inv.id}
                              onClick={() =>
                                void sendReminder(inv.id, draft.subject, draft.body)
                              }
                              className="rounded-md bg-[#00E5A0] px-4 py-2 text-sm font-semibold text-paid-ink transition hover:brightness-110 disabled:opacity-50"
                            >
                              {sendingId === inv.id ? "Sending…" : "Send now"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCompose({
                                  invoiceId: inv.id,
                                  to: inv.client_email,
                                  subject: draft.subject,
                                  body: draft.body,
                                })
                              }
                              className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0]"
                            >
                              Edit & Send
                            </button>
                          </div>
                        </div>
                      )}
                      {draft.status === "error" && (
                        <p className="mt-3 text-sm text-red-400" role="alert">
                          {draft.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

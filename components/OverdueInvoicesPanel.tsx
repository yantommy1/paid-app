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

function gmailComposeUrl(to: string, subject: string, body: string): string {
  const u = new URL("https://mail.google.com/mail/");
  u.searchParams.set("view", "cm");
  u.searchParams.set("fs", "1");
  u.searchParams.set("to", to);
  u.searchParams.set("su", subject);
  u.searchParams.set("body", body);
  return u.toString();
}

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

  const loadInvoices = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/invoices");
      const j = (await res.json()) as { invoices?: Invoice[]; error?: string };
      if (!res.ok) {
        setListError(j.error ?? "Could not load invoices.");
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
          typeof j.error === "string"
            ? j.error
            : "Sync failed. Check your QuickBooks connection."
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
            message: typeof j.error === "string" ? j.error : "Could not draft reminder.",
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
            message:
              typeof j.error === "string"
                ? j.error
                : "Send failed. Check your Gmail connection.",
          },
        }));
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[invoiceId];
        return next;
      });
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

  return (
    <div className="mt-10 space-y-10">
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
            Connect QuickBooks and sync to pull in unpaid invoices.
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
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-paid-mist/85">
                              {draft.body}
                            </pre>
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
                            <a
                              href={gmailComposeUrl(
                                inv.client_email,
                                draft.subject,
                                draft.body
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-paid-mist transition hover:border-[#00E5A0]/45 hover:text-[#00E5A0]"
                            >
                              Edit in Gmail
                            </a>
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

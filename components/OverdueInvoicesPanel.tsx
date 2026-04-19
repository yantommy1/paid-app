"use client";

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

export function OverdueInvoicesPanel() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/invoices");
      const j = (await res.json()) as { invoices?: Invoice[]; error?: string };
      if (!res.ok) {
        setListError(j.error ?? "Failed to load invoices");
        setInvoices([]);
        return;
      }
      const all = j.invoices ?? [];
      const overdue = all.filter((inv) => inv.days_overdue > 0);
      setInvoices(overdue);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load invoices");
      setInvoices([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

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
            message: typeof j.error === "string" ? j.error : "Draft failed",
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
          [invoiceId]: { status: "error", message: "Invalid response from server" },
        }));
      }
    } catch (e) {
      setDrafts((d) => ({
        ...d,
        [invoiceId]: {
          status: "error",
          message: e instanceof Error ? e.message : "Network error",
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
        sentAt?: string;
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
                : "Send failed — check Gmail connection.",
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
    } catch (e) {
      setDrafts((d) => ({
        ...d,
        [invoiceId]: {
          status: "error",
          message: e instanceof Error ? e.message : "Network error",
        },
      }));
    } finally {
      setSendingId(null);
    }
  }

  if (loadingList) {
    return (
      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Loading invoices…</p>
      </section>
    );
  }

  if (listError) {
    return (
      <section className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-800">{listError}</p>
      </section>
    );
  }

  if (invoices.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">Overdue invoices</h3>
        <p className="mt-2 text-sm text-slate-600">
          No overdue invoices right now. Sync from QuickBooks after you add or update invoices.
        </p>
        <button
          type="button"
          onClick={() => void loadInvoices()}
          className="mt-4 text-sm font-medium text-paid-brand hover:underline"
        >
          Refresh list
        </button>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Overdue invoices</h3>
        <button
          type="button"
          onClick={() => void loadInvoices()}
          className="text-sm font-medium text-paid-brand hover:underline"
        >
          Refresh list
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Drafts use <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code>; sending uses
        your connected Gmail (
        <code className="rounded bg-slate-100 px-1">/api/invoices/send-reminder</code>).
      </p>

      <ul className="mt-6 space-y-6">
        {invoices.map((inv) => {
          const draft = drafts[inv.id] ?? { status: "idle" as const };
          const sent = reminderAlreadySent(inv);
          return (
            <li key={inv.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{inv.client_name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    #{inv.quickbooks_invoice_id} · Due {inv.due_date} ·{" "}
                    <span className="font-medium text-amber-800">
                      {inv.days_overdue} days overdue
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-800">
                    ${Number(inv.amount).toFixed(2)} · {inv.status.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">To: {inv.client_email}</p>
                </div>
                {!sent && (
                  <button
                    type="button"
                    onClick={() => void draftReminder(inv.id)}
                    disabled={draft.status === "loading"}
                    className="shrink-0 rounded-lg border border-paid-brand bg-white px-3 py-2 text-sm font-semibold text-paid-brand hover:bg-paid-brand/5 disabled:opacity-50"
                  >
                    {draft.status === "loading" ? "Drafting…" : "Draft Reminder"}
                  </button>
                )}
              </div>

              {sent && (
                <div
                  className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                  role="status"
                >
                  <strong>Reminder sent</strong>
                  {inv.reminder_sent_at && (
                    <>
                      {" "}
                      on {formatSentAt(inv.reminder_sent_at)} to {inv.client_email}.
                    </>
                  )}
                  {!inv.reminder_sent_at && " — recorded in Paid."}
                </div>
              )}

              {draft.status === "ok" && !sent && (
                <div className="mt-4 rounded-lg border border-paid-brand/30 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Subject</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{draft.subject}</p>
                  <p className="mt-4 text-xs font-semibold uppercase text-slate-500">Body</p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800">
                    {draft.body}
                  </pre>
                  <button
                    type="button"
                    disabled={sendingId === inv.id}
                    onClick={() => void sendReminder(inv.id, draft.subject, draft.body)}
                    className="mt-4 rounded-lg bg-paid-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    {sendingId === inv.id ? "Sending…" : "Send"}
                  </button>
                </div>
              )}
              {draft.status === "error" && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {draft.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

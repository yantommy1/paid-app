"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  | { status: "error"; message: string }
  | { status: "sent"; message: string };

type Cohort = {
  id: "over90" | "over60" | "over30";
  title: string;
  subtitle: string;
  filter: (invoice: Invoice) => boolean;
};

const cohorts: Cohort[] = [
  {
    id: "over90",
    title: "90+ days overdue",
    subtitle: "Highest risk balances that need immediate follow-up.",
    filter: (inv) => inv.days_overdue >= 90,
  },
  {
    id: "over60",
    title: "60-89 days overdue",
    subtitle: "Past due balances that should receive firm reminders.",
    filter: (inv) => inv.days_overdue >= 60 && inv.days_overdue < 90,
  },
  {
    id: "over30",
    title: "30-59 days overdue",
    subtitle: "Early delinquency where consistent follow-up prevents slippage.",
    filter: (inv) => inv.days_overdue >= 30 && inv.days_overdue < 60,
  },
];

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function reminderAlreadySent(invoice: Invoice): boolean {
  return invoice.status === "reminder_sent" || Boolean(invoice.reminder_sent_at);
}

export function OverdueInvoicesPanel() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/invoices");
      const j = (await res.json()) as { invoices?: Invoice[]; error?: string };
      if (!res.ok) {
        setListError(j.error ?? "Failed to load invoices.");
        setInvoices([]);
        return;
      }
      const all = j.invoices ?? [];
      setInvoices(all.filter((inv) => inv.days_overdue > 0));
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load invoices.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const cohortData = useMemo(() => {
    return cohorts.map((cohort) => ({
      ...cohort,
      invoices: invoices.filter(cohort.filter),
    }));
  }, [invoices]);

  async function draftReminder(invoiceId: string) {
    setDrafts((prev) => ({ ...prev, [invoiceId]: { status: "loading" } }));
    try {
      const res = await fetch("/api/invoices/draft-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const j = (await res.json()) as { subject?: string; body?: string; error?: string };
      if (!res.ok) {
        setDrafts((prev) => ({
          ...prev,
          [invoiceId]: {
            status: "error",
            message: typeof j.error === "string" ? j.error : "Draft failed.",
          },
        }));
        return;
      }

      if (j.subject && j.body) {
        setDrafts((prev) => ({
          ...prev,
          [invoiceId]: {
            status: "ok",
            subject: j.subject ?? "",
            body: j.body ?? "",
          },
        }));
      } else {
        setDrafts((prev) => ({
          ...prev,
          [invoiceId]: { status: "error", message: "Draft response missing content." },
        }));
      }
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [invoiceId]: {
          status: "error",
          message: e instanceof Error ? e.message : "Network error while drafting.",
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
        body: JSON.stringify({ invoiceId, subject, body, channel: "web" }),
      });
      const j = (await res.json()) as { sentAt?: string; error?: string };
      if (!res.ok) {
        setDrafts((prev) => ({
          ...prev,
          [invoiceId]: {
            status: "error",
            message: typeof j.error === "string" ? j.error : "Send failed.",
          },
        }));
        return;
      }

      setDrafts((prev) => ({
        ...prev,
        [invoiceId]: {
          status: "sent",
          message: `Reminder sent${j.sentAt ? ` on ${formatSentAt(j.sentAt)}` : ""}.`,
        },
      }));
      await loadInvoices();
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [invoiceId]: {
          status: "error",
          message: e instanceof Error ? e.message : "Network error while sending.",
        },
      }));
    } finally {
      setSendingId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/15 bg-white/5 p-6">
        <p className="text-sm text-[#D1D5DB]">Loading overdue invoices...</p>
      </section>
    );
  }

  if (listError) {
    return (
      <section className="rounded-2xl border border-red-400/40 bg-red-900/20 p-6">
        <p className="text-sm text-red-200">{listError}</p>
      </section>
    );
  }

  if (invoices.length === 0) {
    return (
      <section className="rounded-2xl border border-white/15 bg-white/5 p-6">
        <h2 className="font-display text-2xl text-white">Overdue invoices</h2>
        <p className="mt-2 text-sm text-[#C8CDD3]">No overdue invoices right now.</p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      {cohortData.map((cohort) => {
        if (cohort.invoices.length === 0) return null;

        return (
          <article key={cohort.id} className="rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="mb-5 border-b border-white/10 pb-4">
              <h2 className="font-display text-3xl text-white">{cohort.title}</h2>
              <p className="mt-2 text-sm text-[#C8CDD3]">{cohort.subtitle}</p>
            </div>

            <ul className="space-y-5">
              {cohort.invoices.map((inv) => {
                const draft = drafts[inv.id] ?? { status: "idle" as const };
                const sent = reminderAlreadySent(inv);
                return (
                  <li key={inv.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-base font-semibold text-white">{inv.client_name}</p>
                        <p className="mt-1 text-sm text-[#C8CDD3]">
                          Invoice #{inv.quickbooks_invoice_id} - {inv.days_overdue} days overdue
                        </p>
                        <p className="mt-1 text-sm text-[#E7E7E7]">
                          ${formatMoney(Number(inv.amount))} - {inv.status.replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 text-xs text-[#B9C0C8]">To: {inv.client_email}</p>
                        {sent && (
                          <p className="mt-2 text-xs text-emerald-300">
                            Reminder sent
                            {inv.reminder_sent_at
                              ? ` on ${formatSentAt(inv.reminder_sent_at)}`
                              : ""}.
                          </p>
                        )}
                      </div>

                      {!sent && (
                        <button
                          type="button"
                          onClick={() => void draftReminder(inv.id)}
                          disabled={draft.status === "loading"}
                          className="shrink-0 rounded-md border border-[#1B4332] bg-[#1B4332]/20 px-4 py-2 text-sm font-medium text-[#D7ECE2] hover:bg-[#1B4332]/35 disabled:opacity-60"
                        >
                          {draft.status === "loading" ? "Drafting..." : "Draft Reminder"}
                        </button>
                      )}
                    </div>

                    {draft.status === "ok" && !sent && (
                      <div className="mt-4 rounded-lg border border-[#1B4332]/50 bg-[#0F1915] p-4">
                        <p className="text-xs uppercase tracking-[0.15em] text-[#8FB39F]">Subject</p>
                        <p className="mt-1 text-sm font-medium text-white">{draft.subject}</p>
                        <p className="mt-4 text-xs uppercase tracking-[0.15em] text-[#8FB39F]">Body</p>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[#E6ECE8]">
                          {draft.body}
                        </pre>
                        <button
                          type="button"
                          onClick={() => void sendReminder(inv.id, draft.subject, draft.body)}
                          disabled={sendingId === inv.id}
                          className="mt-4 rounded-md bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#245941] disabled:opacity-60"
                        >
                          {sendingId === inv.id ? "Sending..." : "Send Reminder"}
                        </button>
                      </div>
                    )}

                    {draft.status === "error" && (
                      <p className="mt-3 text-sm text-red-300" role="alert">
                        {draft.message}
                      </p>
                    )}
                    {draft.status === "sent" && (
                      <p className="mt-3 text-sm text-emerald-300" role="status">
                        {draft.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

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

type Stats = {
  totalOutstanding: number;
  remindersSent: number;
  amountRecovered: number;
  avgDaysToCollect: number;
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

function openGmailCompose(to: string, subject: string, body: string) {
  const url =
    "https://mail.google.com/mail/?view=cm&fs=1" +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank", "width=600,height=700,left=200,top=100");
}

export function OverdueInvoicesPanel() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices/stats");
      const j = (await res.json()) as Stats & { error?: string };
      if (!res.ok) return;
      setStats(j);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
    void loadStats();
  }, [loadInvoices, loadStats]);

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

  async function syncInvoices() {
    setSyncing(true);
    try {
      const res = await fetch("/api/invoices/sync", { method: "POST" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setListError(j.error ?? "Sync failed.");
        return;
      }
      await loadInvoices();
      await loadStats();
    } catch {
      setListError("Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F5] p-6">
        <p className="text-sm text-[#6B6B6B]">Loading overdue invoices...</p>
      </section>
    );
  }

  if (listError) {
    return (
      <section className="rounded-2xl border border-[#E5E5E5] bg-white p-6">
        <p className="text-sm text-red-600">{listError}</p>
      </section>
    );
  }

  if (invoices.length === 0) {
    return (
      <section className="rounded-2xl border border-[#E5E5E5] bg-white p-6">
        <h2 className="font-display text-2xl text-[#0D0D0D]">Overdue invoices</h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">No overdue invoices right now.</p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <article className="border border-[#E5E5E5] bg-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
              Total outstanding AR
            </p>
            <p className="mt-2 font-display text-3xl text-[#0D0D0D]">${formatMoney(stats.totalOutstanding)}</p>
          </article>
          <article className="border border-[#E5E5E5] bg-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
              Reminders sent
            </p>
            <p className="mt-2 font-display text-3xl text-[#0D0D0D]">{stats.remindersSent}</p>
          </article>
          <article className="border border-[#E5E5E5] bg-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
              Amount recovered
            </p>
            <p className="mt-2 font-display text-3xl text-[#0D0D0D]">${formatMoney(stats.amountRecovered)}</p>
          </article>
          <article className="border border-[#E5E5E5] bg-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#6B6B6B]">
              Average days to collect
            </p>
            <p className="mt-2 font-display text-3xl text-[#0D0D0D]">{stats.avgDaysToCollect}</p>
          </article>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void syncInvoices()}
          disabled={syncing}
          className="rounded bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {syncing ? "Syncing..." : "Sync now"}
        </button>
      </div>
      {cohortData.map((cohort) => {
        if (cohort.invoices.length === 0) return null;

        return (
          <article key={cohort.id} className="rounded-2xl border border-[#E5E5E5] bg-white p-6">
            <div className="mb-5 border-b border-[#E5E5E5] pb-4">
              <div className="flex items-center gap-3">
                <span className="h-7 w-1.5 bg-[#1B4332]" aria-hidden />
                <h2 className="font-display text-3xl text-[#0D0D0D]">{cohort.title}</h2>
              </div>
              <p className="mt-2 text-sm text-[#6B6B6B]">{cohort.subtitle}</p>
            </div>

            <ul className="space-y-5">
              {cohort.invoices.map((inv) => {
                const draft = drafts[inv.id] ?? { status: "idle" as const };
                const sent = reminderAlreadySent(inv);
                return (
                  <li key={inv.id} className="rounded-xl border border-[#E5E5E5] bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-base font-semibold text-[#0D0D0D]">{inv.client_name}</p>
                        <p className="mt-1 text-sm text-[#6B6B6B]">
                          Invoice #{inv.quickbooks_invoice_id}
                        </p>
                        <p className="mt-1 text-sm text-[#0D0D0D]">
                          ${formatMoney(Number(inv.amount))} - {inv.status.replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 text-xs text-[#6B6B6B]">To: {inv.client_email}</p>
                        <span
                          className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-medium ${
                            inv.days_overdue >= 90
                              ? "bg-red-100 text-red-700"
                              : inv.days_overdue >= 60
                                ? "bg-orange-100 text-orange-700"
                                : inv.days_overdue >= 30
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-green-100 text-green-700"
                          }`}
                        >
                          {inv.days_overdue} days overdue
                        </span>
                        {sent && (
                          <p className="mt-2 text-xs text-[#1B4332]">
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
                          className="shrink-0 rounded-md border border-[#1B4332] bg-white px-4 py-2 text-sm font-medium text-[#1B4332] hover:bg-[#F7F7F5] disabled:opacity-60"
                        >
                          {draft.status === "loading" ? "Drafting..." : "Draft Reminder"}
                        </button>
                      )}
                    </div>

                    {draft.status === "ok" && !sent && (
                      <div className="mt-4 rounded-lg border border-[#E5E5E5] bg-[#F7F7F5] p-4">
                        <p className="text-xs uppercase tracking-[0.15em] text-[#6B6B6B]">Subject</p>
                        <p className="mt-1 text-sm font-medium text-[#0D0D0D]">{draft.subject}</p>
                        <p className="mt-4 text-xs uppercase tracking-[0.15em] text-[#6B6B6B]">Body</p>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[#0D0D0D]">
                          {draft.body}
                        </pre>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openGmailCompose(inv.client_email, draft.subject, draft.body)
                            }
                            className="rounded-md border border-[#1B4332] bg-white px-4 py-2 text-sm font-semibold text-[#1B4332] hover:bg-[#F7F7F5]"
                          >
                            Edit in Gmail
                          </button>
                          <button
                            type="button"
                            onClick={() => void sendReminder(inv.id, draft.subject, draft.body)}
                            disabled={sendingId === inv.id}
                            className="rounded-md bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#245941] disabled:opacity-60"
                          >
                            {sendingId === inv.id ? "Sending..." : "Send Now"}
                          </button>
                        </div>
                      </div>
                    )}

                    {draft.status === "error" && (
                      <p className="mt-3 text-sm text-red-600" role="alert">
                        {draft.message}
                      </p>
                    )}
                    {draft.status === "sent" && (
                      <p className="mt-3 text-sm text-[#1B4332]" role="status">
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

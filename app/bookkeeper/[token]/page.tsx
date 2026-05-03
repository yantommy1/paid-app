import { resolveBookkeeperToken } from "@/lib/bookkeeper/token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { BookkeeperReviewClient } from "@/components/bookkeeper/BookkeeperReviewClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue — Paid" };

export default async function BookkeeperPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolveBookkeeperToken(token);

  if (!ctx) {
    return (
      <main className="min-h-screen bg-white px-6 py-24 text-[#0D0D0D]">
        <div className="mx-auto max-w-xl border border-[#E5E5E5] bg-white p-10 text-center">
          <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Paid</p>
          <h1 className="mt-3 font-display text-3xl">This link is no longer active.</h1>
          <p className="mt-4 text-sm text-[#6B6B6B]">
            The owner may have revoked your access, or the link has expired. Ask them to send a fresh invite.
          </p>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: owner } = await admin
    .from("users")
    .select("email")
    .eq("id", ctx.ownerUserId)
    .maybeSingle();

  const { data: invoices } = await admin
    .from("invoices")
    .select(
      "id, client_name, client_email, amount, due_date, days_overdue, status, reminder_sent_at, reminder_pending, reminder_draft, quickbooks_invoice_id"
    )
    .eq("user_id", ctx.ownerUserId)
    .neq("status", "paid")
    .gte("days_overdue", 1)
    .order("days_overdue", { ascending: false });

  return (
    <BookkeeperReviewClient
      token={token}
      ownerEmail={owner?.email ?? null}
      bookkeeperEmail={ctx.bookkeeperEmail}
      permissions={ctx.permissions}
      invoices={(invoices ?? []).map((row) => ({
        id: row.id,
        clientName: row.client_name,
        clientEmail: row.client_email,
        amount: Number(row.amount),
        dueDate: row.due_date,
        daysOverdue: row.days_overdue,
        status: row.status,
        reminderSentAt: row.reminder_sent_at,
        reminderPending: row.reminder_pending,
        reminderDraft: row.reminder_draft,
        quickbooksInvoiceId: row.quickbooks_invoice_id,
      }))}
    />
  );
}

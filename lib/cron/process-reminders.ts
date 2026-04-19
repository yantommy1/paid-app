import { draftReminderEmail } from "@/lib/anthropic/draft";
import { sendGmailMessage } from "@/lib/gmail/send";
import { ensureGmailToken, ensureQuickBooksToken } from "@/lib/oauth/tokens";
import type { GmailToken, QuickBooksToken } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type UserRow = {
  id: string;
  email: string | null;
  quickbooks_token: QuickBooksToken | null;
  gmail_token: GmailToken | null;
};

/** Returns counts for logging */
export async function processDailyReminders(
  supabase: SupabaseClient,
  user: UserRow,
  settings: { auto_send_enabled: boolean }
): Promise<{ sent: number; queued: number; skipped: number }> {
  let sent = 0;
  let queued = 0;
  let skipped = 0;

  const qb = await ensureQuickBooksToken(user.quickbooks_token);
  const gm = await ensureGmailToken(user.gmail_token);
  if (!qb || !gm) {
    return { sent: 0, queued: 0, skipped: 0 };
  }

  // Persist refreshed tokens
  await supabase
    .from("users")
    .update({
      quickbooks_token: qb as unknown as Record<string, unknown>,
      gmail_token: gm as unknown as Record<string, unknown>,
    })
    .eq("id", user.id);

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["overdue_30", "overdue_60", "overdue_90"]);

  if (error || !invoices?.length) {
    return { sent: 0, queued: 0, skipped: 0 };
  }

  const ownerName = user.email?.split("@")[0] ?? "there";

  for (const inv of invoices) {
    const last = inv.reminder_sent_at
      ? new Date(inv.reminder_sent_at).getTime()
      : 0;
    const dayMs = 86400000;
    const daysSince = last ? (Date.now() - last) / dayMs : 999;
    // Avoid spamming: at most one reminder per tier crossing / 24h — simplified: once per day max
    if (daysSince < 0.9) {
      skipped++;
      continue;
    }

    const draft = await draftReminderEmail(
      {
        client_name: inv.client_name,
        amount: inv.amount,
        days_overdue: inv.days_overdue,
        due_date: inv.due_date,
        quickbooks_invoice_id: inv.quickbooks_invoice_id,
      },
      ownerName
    );

    if (settings.auto_send_enabled) {
      await sendGmailMessage(gm, inv.client_email, draft.subject, draft.body);
      await supabase
        .from("invoices")
        .update({
          reminder_sent_at: new Date().toISOString(),
          reminder_pending: false,
          reminder_draft: null,
        })
        .eq("id", inv.id);
      await supabase.from("reminder_logs").insert({
        user_id: user.id,
        invoice_id: inv.id,
        channel: "cron",
        subject: draft.subject,
        sent_to: inv.client_email,
      });
      sent++;
    } else {
      await supabase
        .from("invoices")
        .update({
          reminder_pending: true,
          reminder_draft: JSON.stringify(draft),
        })
        .eq("id", inv.id);
      queued++;
    }
  }

  return { sent, queued, skipped };
}

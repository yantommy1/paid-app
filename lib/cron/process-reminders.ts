import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { displayNameFromEmail } from "@/lib/auth/display-name";
import { ensureGmailToken, ensureQuickBooksToken } from "@/lib/oauth/tokens";
import type { GmailToken, QuickBooksToken } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type UserRow = {
  id: string;
  email: string | null;
  quickbooks_token: QuickBooksToken | null;
  gmail_token: GmailToken | null;
};

/**
 * Daily cron: drafts reminders for every overdue invoice and queues them for the user
 * to approve in the Gmail Add-On. Never auto-sends — that is an explicit product decision.
 */
export async function processDailyReminders(
  supabase: SupabaseClient,
  user: UserRow,
  // Kept for backwards compatibility; ignored. Drafts are always queued, never auto-sent.
  _settings: { auto_send_enabled: boolean }
): Promise<{ sent: number; queued: number; skipped: number }> {
  void _settings;
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

  const senderName = displayNameFromEmail(user.email);

  for (const inv of invoices) {
    const last = inv.reminder_sent_at ? new Date(inv.reminder_sent_at).getTime() : 0;
    const dayMs = 86400000;
    const daysSince = last ? (Date.now() - last) / dayMs : 999;
    // Avoid spamming: at most one draft refresh per 24h
    if (daysSince < 0.9) {
      skipped++;
      continue;
    }

    try {
      const built = await buildReminderForInvoice(supabase, user.id, inv, senderName);
      await supabase
        .from("invoices")
        .update({
          reminder_pending: true,
          reminder_draft: JSON.stringify({
            subject: built.subject,
            body: built.body,
            tone: built.tone,
            payNowIncluded: built.payNowIncluded,
          }),
        })
        .eq("id", inv.id);
      queued++;
    } catch {
      skipped++;
    }
  }

  return { sent: 0, queued, skipped };
}

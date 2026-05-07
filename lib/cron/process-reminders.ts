import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { computeAutoTone, type Tone } from "@/lib/tone/compute";
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

const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/**
 * Daily cron: pre-warms all-tone drafts for every overdue invoice so the
 * first user click of the day reads from cache (no LLM round-trip). Never
 * auto-sends — drafts wait for human approval in the add-on.
 */
export async function processDailyReminders(
  supabase: SupabaseClient,
  user: UserRow,
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

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("tone_default, tone_auto_adjust")
    .eq("user_id", user.id)
    .maybeSingle();
  const toneSettings = {
    tone_default: (settingsRow?.tone_default as Tone | undefined) ?? "professional",
    tone_auto_adjust: settingsRow?.tone_auto_adjust ?? true,
  };

  for (const inv of invoices) {
    // Skip if cache is fresh — saves API quota when the cron runs more than once per day.
    if (
      inv.draft_all_tones_at &&
      Date.now() - new Date(inv.draft_all_tones_at).getTime() < CACHE_FRESHNESS_MS
    ) {
      skipped++;
      continue;
    }

    try {
      const tones: Tone[] = ["friendly", "professional", "firm"];
      const builds = await Promise.all(
        tones.map((tone) =>
          buildReminderForInvoice(supabase, user.id, inv, senderName, {
            toneOverride: tone,
          })
        )
      );
      const [friendly, professional, firm] = builds;

      const autoTone = await computeAutoTone(
        supabase,
        user.id,
        {
          id: inv.id,
          amount: Number(inv.amount),
          days_overdue: inv.days_overdue,
          client_email: inv.client_email,
        },
        toneSettings
      );

      await supabase
        .from("invoices")
        .update({
          reminder_pending: true,
          reminder_draft: JSON.stringify({
            subject: builds[0].subject,
            body: builds[0].body,
            tone: autoTone,
            payNowIncluded: builds[0].payNowIncluded,
          }),
          draft_all_tones: {
            friendly: {
              subject: friendly.subject,
              body: friendly.body,
              payNowIncluded: friendly.payNowIncluded,
            },
            professional: {
              subject: professional.subject,
              body: professional.body,
              payNowIncluded: professional.payNowIncluded,
            },
            firm: {
              subject: firm.subject,
              body: firm.body,
              payNowIncluded: firm.payNowIncluded,
            },
          },
          draft_all_tones_at: new Date().toISOString(),
          draft_auto_tone: autoTone,
        })
        .eq("id", inv.id);
      queued++;
    } catch {
      skipped++;
    }
  }

  return { sent: 0, queued, skipped };
}

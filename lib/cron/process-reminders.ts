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
 *
 * Also processes due reminder_schedules (from reply-classification
 * auto-scheduling): when a scheduled follow-up's date arrives, escalate the
 * invoice's draft tone to 'firm' (the client broke a payment promise; the
 * next reminder shouldn't read like the first one), and mark the schedule
 * as fulfilled so the History card stops showing it as planned.
 */
export async function processDailyReminders(
  supabase: SupabaseClient,
  user: UserRow,
  _settings: { auto_send_enabled: boolean }
): Promise<{ sent: number; queued: number; skipped: number; followups: number }> {
  void _settings;
  let queued = 0;
  let skipped = 0;
  let followups = 0;

  const qb = await ensureQuickBooksToken(user.quickbooks_token);
  const gm = await ensureGmailToken(user.gmail_token);
  if (!qb || !gm) {
    return { sent: 0, queued: 0, skipped: 0, followups: 0 };
  }

  await supabase
    .from("users")
    .update({
      quickbooks_token: qb as unknown as Record<string, unknown>,
      gmail_token: gm as unknown as Record<string, unknown>,
    })
    .eq("id", user.id);

  // Process due reminder_schedules first. Marking them fulfilled here means
  // the rest of the cron's draft pre-warming for the same invoice will use
  // the escalated tone. Done before the invoice loop, not after, so the
  // schedule's escalation reaches the same-tick draft cache.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: dueSchedules } = await supabase
    .from("reminder_schedules")
    .select("id, invoice_id, scheduled_for, reason")
    .eq("user_id", user.id)
    .lte("scheduled_for", todayIso)
    .is("fulfilled_at", null)
    .is("cancelled_at", null);

  const escalatedInvoiceIds = new Set<string>();
  for (const sched of dueSchedules ?? []) {
    if (sched.invoice_id) escalatedInvoiceIds.add(sched.invoice_id);
    await supabase
      .from("reminder_schedules")
      .update({ fulfilled_at: new Date().toISOString() })
      .eq("id", sched.id);
    followups++;
  }

  // Include 'reminder_sent' invoices that have a due schedule. After the
  // first reminder goes out, invoice.status flips to 'reminder_sent' and
  // it drops out of the overdue_* set the cron normally processes.
  // Without this, a scheduled follow-up's escalation branch can't fire
  // (the invoice isn't in the loop), so the firm draft never gets
  // pre-warmed for Aug 26 etc. — broken promise made by the Planned UI.
  const escalatedIds = Array.from(escalatedInvoiceIds);
  const statusFilter = ["overdue_30", "overdue_60", "overdue_90"];
  let invoicesQuery = supabase
    .from("invoices")
    .select("*")
    .eq("user_id", user.id);
  if (escalatedIds.length) {
    // Postgrest .or() between an in-clause and an explicit id-list.
    // Quote each uuid so commas in the value (not a real concern for
    // uuids, but the format requires it) don't break parsing.
    const idsCsv = escalatedIds.map((id) => `"${id}"`).join(",");
    invoicesQuery = invoicesQuery.or(
      `status.in.(${statusFilter.join(",")}),id.in.(${idsCsv})`
    );
  } else {
    invoicesQuery = invoicesQuery.in("status", statusFilter);
  }
  const { data: invoices, error } = await invoicesQuery;

  if (error || !invoices?.length) {
    return { sent: 0, queued: 0, skipped: 0, followups };
  }

  // For each escalated invoice currently in 'reminder_sent' status, flip
  // it back to the right overdue_X bucket so the home card cohorts
  // surface it again. The schedule firing means "we're still chasing this"
  // — the reminder_sent label was true yesterday, isn't accurate today.
  for (const inv of invoices) {
    if (
      escalatedInvoiceIds.has(inv.id) &&
      inv.status === "reminder_sent" &&
      typeof inv.days_overdue === "number"
    ) {
      const newStatus =
        inv.days_overdue >= 90
          ? "overdue_90"
          : inv.days_overdue >= 60
          ? "overdue_60"
          : inv.days_overdue >= 30
          ? "overdue_30"
          : "current";
      if (newStatus !== "current") {
        await supabase
          .from("invoices")
          .update({ status: newStatus })
          .eq("id", inv.id);
        inv.status = newStatus;
      }
    }
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
    const isEscalated = escalatedInvoiceIds.has(inv.id);
    // Cache freshness skip — but NEVER skip when there's a due schedule for
    // this invoice. The whole point of the schedule was "regenerate the
    // draft today with escalated tone"; trusting yesterday's cache would
    // miss the escalation.
    if (
      !isEscalated &&
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

      // When a scheduled follow-up just came due, force the default tone to
      // 'firm'. The client made a promise and missed (or is about to miss)
      // it — opening with a friendly nudge again would read as a system
      // that doesn't know what's going on. The other tones stay available
      // in the all-tones cache so the merchant can still override.
      const autoTone = isEscalated
        ? "firm"
        : await computeAutoTone(
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

  return { sent: 0, queued, skipped, followups };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type Tone = "friendly" | "professional" | "firm";

export type ToneSettings = {
  tone_default: Tone;
  tone_auto_adjust: boolean;
};

export type InvoiceForTone = {
  id?: string;
  amount: number;
  days_overdue: number;
  client_email: string;
};

const FIRM_AMOUNT_THRESHOLD = 10000;
const VERY_FIRM_OVERDUE_DAYS = 60;

/**
 * Auto-derive tone from invoice + client history + settings.
 * - Client history with prior on-time payments biases softer (friendly).
 * - Client history with prior late payments biases firmer (firm).
 * - Larger invoices (>=$10k) bias firmer.
 * - 60+ days overdue forces firm regardless.
 */
export async function computeAutoTone(
  supabase: SupabaseClient,
  userId: string,
  invoice: InvoiceForTone,
  settings: ToneSettings
): Promise<Tone> {
  // If user has disabled auto-adjust, just return their default.
  if (!settings.tone_auto_adjust) {
    return settings.tone_default;
  }

  // 60+ days overdue: always firm.
  if (invoice.days_overdue >= VERY_FIRM_OVERDUE_DAYS) {
    return "firm";
  }

  // Pull client history: count of paid-on-time vs paid-late vs still-overdue invoices for this client_email.
  const lowerEmail = invoice.client_email?.trim().toLowerCase() ?? "";
  let onTime = 0;
  let late = 0;
  let stillOverdue = 0;
  if (lowerEmail) {
    const { data: history } = await supabase
      .from("invoices")
      .select("status, days_overdue, recovered_at, due_date")
      .eq("user_id", userId)
      .ilike("client_email", lowerEmail);

    for (const row of history ?? []) {
      if (invoice.id && row && (row as { id?: string }).id === invoice.id) continue;
      const status = (row as { status?: string }).status ?? "";
      const recoveredAt = (row as { recovered_at?: string | null }).recovered_at ?? null;
      const dueDate = (row as { due_date?: string | null }).due_date ?? null;
      const daysOverdue = Number((row as { days_overdue?: number }).days_overdue ?? 0);
      if (status === "paid") {
        const wasLate =
          (recoveredAt && dueDate && new Date(recoveredAt) > new Date(dueDate)) || daysOverdue > 0;
        if (wasLate) late++;
        else onTime++;
      } else if (status.startsWith("overdue") || status === "reminder_sent") {
        stillOverdue++;
      }
    }
  }

  // Large invoice -> bias firmer regardless of default.
  if (Number(invoice.amount) >= FIRM_AMOUNT_THRESHOLD) {
    if (invoice.days_overdue >= 30) return "firm";
    return "professional";
  }

  // Repeat-late client -> firm.
  if (late >= 2 || stillOverdue >= 2) {
    return "firm";
  }

  // Two or more on-time payments and nothing overdue -> friendly.
  if (onTime >= 2 && late === 0 && stillOverdue === 0) {
    return "friendly";
  }

  return settings.tone_default;
}

export function toneGuidanceCopy(tone: Tone, daysOverdue: number): string {
  if (tone === "firm") {
    return daysOverdue >= 90
      ? "Firm and direct. This is well past the agreed terms. State the facts, the amount, and the next step. Respectful, not aggressive. Owner needs this resolved this week."
      : "Firm and direct. Reference the agreed terms and the amount due. Respectful, no anger. Make the next step unmistakable.";
  }
  if (tone === "friendly") {
    return "Warm and conversational. Assume the best — the email got missed, the invoice got buried. Light touch, owner-to-owner.";
  }
  return "Professional and matter-of-fact. Clear ask, brief context, no apology. The voice of a partner who has 14 other things to do today.";
}

import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { computeAutoTone, type Tone } from "@/lib/tone/compute";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { getUserPlan } from "@/lib/billing/plan";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  senderName: z.string().min(1).max(120).optional(),
  discountPct: z.number().min(0).max(50).nullable().optional(),
  paymentPlanEnabled: z.boolean().nullable().optional(),
  disablePayLink: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
});

const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Cache-first all-tones drafting.
 *
 * 1) If the invoice has cached `draft_all_tones` less than 24h old, return it
 *    instantly (no LLM call). This is the hot path users hit all day after
 *    the daily cron has pre-warmed the cache.
 * 2) Otherwise compute fresh, store on the invoice row, return.
 *
 * The 3 Anthropic calls (one per tone) still run in parallel on the cold path.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return serverError("Invalid payload", 400);

  const supabase = await createRouteHandlerClient(request);

  // Plan gate — Starter does not get the tone selector. Server still
  // generates a draft, just only the single autoTone variant. The
  // response shape stays the same (autoTone + tones object) so add-on
  // code doesn't need to branch — Starter just gets one tone populated
  // and the other slots empty.
  const plan = await getUserPlan(supabase, ctx.user.id);
  const isPro = plan === "pro";

  const { data: inv, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.user.id)
    .single();
  if (error || !inv) return notFound("Invoice not found");

  // Cache-first.
  if (
    !parsed.data.forceRefresh &&
    inv.draft_all_tones &&
    inv.draft_all_tones_at &&
    Date.now() - new Date(inv.draft_all_tones_at).getTime() < CACHE_FRESHNESS_MS
  ) {
    return NextResponse.json({
      autoTone: inv.draft_auto_tone ?? "professional",
      tones: inv.draft_all_tones,
      cacheHit: true,
    });
  }

  const senderName = parsed.data.senderName ?? getUserDisplayName(ctx.user);

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("tone_default, tone_auto_adjust")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  // Tone auto-adjust by client history is also gated to Pro per the
  // pricing page. For Starter, skip the history adjust and default to
  // professional. For Pro, run the full computeAutoTone logic.
  const autoTone: Tone = isPro
    ? await computeAutoTone(
        supabase,
        ctx.user.id,
        {
          id: inv.id,
          amount: Number(inv.amount),
          days_overdue: inv.days_overdue,
          client_email: inv.client_email,
        },
        {
          tone_default:
            (settingsRow?.tone_default as Tone | undefined) ?? "professional",
          tone_auto_adjust: settingsRow?.tone_auto_adjust ?? true,
        }
      )
    : "professional";

  try {
    // Starter gets one tone (autoTone, currently fixed at professional).
    // Pro gets all three with the auto pick highlighted.
    const tonesToBuild: Tone[] = isPro
      ? ["friendly", "professional", "firm"]
      : [autoTone];
    const results = await Promise.all(
      tonesToBuild.map((tone) =>
        buildReminderForInvoice(supabase, ctx.user.id, inv, senderName, {
          toneOverride: tone,
          discountPctOverride: parsed.data.discountPct,
          paymentPlanOverride: parsed.data.paymentPlanEnabled,
          disablePayLink: parsed.data.disablePayLink,
          // Starter: strip early-pay discount + payment plan offer lines.
          // Plain Pay Now stays.
          suppressPlanExtras: !isPro,
        })
      )
    );

    // Assemble the tonesPayload object. Pro fills all three slots; Starter
    // populates only the autoTone slot and leaves the other two null so
    // the add-on (which expects the {friendly, professional, firm} shape)
    // can detect the locked tones and render an upgrade chip in their
    // place instead of a tone button.
    const tonesPayload: {
      friendly: { subject: string; body: string; payNowIncluded: boolean } | null;
      professional: { subject: string; body: string; payNowIncluded: boolean } | null;
      firm: { subject: string; body: string; payNowIncluded: boolean } | null;
    } = {
      friendly: null,
      professional: null,
      firm: null,
    };
    for (let i = 0; i < tonesToBuild.length; i++) {
      const t = tonesToBuild[i];
      const r = results[i];
      tonesPayload[t] = {
        subject: r.subject,
        body: r.body,
        payNowIncluded: r.payNowIncluded,
      };
    }

    // Persist to cache so the next click is instant. Best-effort; don't block
    // the response on the write.
    void supabase
      .from("invoices")
      .update({
        draft_all_tones: tonesPayload,
        draft_all_tones_at: new Date().toISOString(),
        draft_auto_tone: autoTone,
      })
      .eq("id", inv.id)
      .then(() => undefined);

    return NextResponse.json({
      autoTone,
      tones: tonesPayload,
      cacheHit: false,
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Draft failed");
  }
}

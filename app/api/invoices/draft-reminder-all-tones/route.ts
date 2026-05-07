import { buildReminderForInvoice } from "@/lib/invoices/build-reminder";
import { computeAutoTone, type Tone } from "@/lib/tone/compute";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  senderName: z.string().min(1).max(120).optional(),
  discountPct: z.number().min(0).max(50).nullable().optional(),
  paymentPlanEnabled: z.boolean().nullable().optional(),
  disablePayLink: z.boolean().optional(),
});

/**
 * Generate all three tone variants in one request so the Gmail Add-On can
 * cache them and let the user toggle tone without another network round-trip.
 *
 * The three Anthropic calls run in parallel via Promise.all, so wall-clock
 * time is ~max(t_friendly, t_professional, t_firm) which is roughly the same
 * as a single draft. That cuts add-on tone-switching latency to zero.
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
  const { data: inv, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.user.id)
    .single();
  if (error || !inv) return notFound("Invoice not found");

  const senderName = parsed.data.senderName ?? getUserDisplayName(ctx.user);

  // Compute the auto-picked tone once (uses settings + client history).
  // We resolve settings here so each per-tone build doesn't re-query.
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("tone_default, tone_auto_adjust")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  const autoTone = await computeAutoTone(
    supabase,
    ctx.user.id,
    {
      id: inv.id,
      amount: Number(inv.amount),
      days_overdue: inv.days_overdue,
      client_email: inv.client_email,
    },
    {
      tone_default: (settingsRow?.tone_default as Tone | undefined) ?? "professional",
      tone_auto_adjust: settingsRow?.tone_auto_adjust ?? true,
    }
  );

  try {
    const tones: Tone[] = ["friendly", "professional", "firm"];
    const results = await Promise.all(
      tones.map((tone) =>
        buildReminderForInvoice(supabase, ctx.user.id, inv, senderName, {
          toneOverride: tone,
          discountPctOverride: parsed.data.discountPct,
          paymentPlanOverride: parsed.data.paymentPlanEnabled,
          disablePayLink: parsed.data.disablePayLink,
        })
      )
    );

    const [friendly, professional, firm] = results;

    return NextResponse.json({
      autoTone,
      tones: {
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
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Draft failed");
  }
}

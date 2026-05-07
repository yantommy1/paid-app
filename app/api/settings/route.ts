import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PatchSchema = z.object({
  auto_send_enabled: z.boolean().optional(),
  fee_30_day: z.number().min(0).max(100).optional(),
  fee_60_day: z.number().min(0).max(100).optional(),
  fee_90_day: z.number().min(0).max(100).optional(),
  tone_default: z.enum(["friendly", "professional", "firm"]).optional(),
  tone_auto_adjust: z.boolean().optional(),
  payment_link_enabled: z.boolean().optional(),
  early_pay_discount_pct: z.number().min(0).max(50).optional(),
  early_pay_discount_days: z.number().int().min(1).max(60).optional(),
  payment_plan_enabled: z.boolean().optional(),
  payment_plan_installments: z.number().int().min(2).max(12).optional(),
  pay_now_button_label: z.string().min(1).max(64).optional(),
  accept_card: z.boolean().optional(),
  accept_ach: z.boolean().optional(),
  quickbooks_auto_record_payments: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (error) {
    return serverError(error.message);
  }
  return NextResponse.json({ settings: data ?? null });
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return serverError("Invalid payload", 400);
  }

  const supabase = await createRouteHandlerClient(request);
  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("user_id", ctx.user.id);

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ ok: true });
}

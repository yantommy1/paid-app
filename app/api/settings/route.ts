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
});

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

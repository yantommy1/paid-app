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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createRouteHandlerClient(request);
  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("user_id", ctx.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

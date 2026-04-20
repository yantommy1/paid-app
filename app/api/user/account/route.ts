import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/** Permanently delete the authenticated user (auth + cascaded app data). */
export async function DELETE(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(ctx.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

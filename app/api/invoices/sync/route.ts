import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { ensureQuickBooksToken } from "@/lib/oauth/tokens";
import { syncInvoicesForUser } from "@/lib/quickbooks/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import type { QuickBooksToken } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;
  const user = ctx.user;

  const supabase = await createRouteHandlerClient(request);
  const { data: row, error } = await supabase
    .from("users")
    .select("quickbooks_token")
    .eq("id", user.id)
    .single();

  if (error || !row?.quickbooks_token) {
    return NextResponse.json(
      { error: "QuickBooks not connected" },
      { status: 400 }
    );
  }

  let token = row.quickbooks_token as unknown as QuickBooksToken;
  try {
    const fresh = await ensureQuickBooksToken(token);
    if (!fresh) {
      return NextResponse.json(
        { error: "QuickBooks token invalid — reconnect." },
        { status: 401 }
      );
    }
    token = fresh;

    const admin = createAdminClient();
    await admin
      .from("users")
      .update({ quickbooks_token: token as unknown as Record<string, unknown> })
      .eq("id", user.id);

    const result = await syncInvoicesForUser(admin, user.id, token);
    const syncedAt = new Date().toISOString();
    await admin
      .from("users")
      .update({ quickbooks_last_synced_at: syncedAt })
      .eq("id", user.id);
    return NextResponse.json({
      ok: true,
      upserted: result.upserted,
      overdueCount: result.overdueCount,
      lastSyncedAt: syncedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

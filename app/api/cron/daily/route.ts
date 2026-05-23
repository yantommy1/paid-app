import { processDailyReminders } from "@/lib/cron/process-reminders";
import { serverError, unauthorized } from "@/lib/api/errors";
import { logError, logInfo } from "@/lib/observability/log";
import { ensureQuickBooksToken } from "@/lib/oauth/tokens";
import { syncInvoicesForUser } from "@/lib/quickbooks/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GmailToken, QuickBooksToken } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron: sync QuickBooks + send/queue reminders.
 * Protect with CRON_SECRET in Authorization header.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const q = request.nextUrl.searchParams.get("secret");
  const fromVercelCron = request.headers.get("x-vercel-cron") === "1";
  const ok =
    fromVercelCron ||
    (secret && (auth === `Bearer ${secret}` || q === secret));
  if (!ok) {
    return unauthorized();
  }

  const admin = createAdminClient();
  // Only select fields we actually use — keeps the response small at scale.
  const { data: users, error } = await admin
    .from("users")
    .select("id, email, quickbooks_token, gmail_token");
  if (error) {
    return serverError(error.message);
  }

  const results: Record<string, { sync?: string; reminders?: string }> = {};

  /**
   * Process one user: refresh QB token → sync invoices → load settings →
   * process daily reminders. Errors are swallowed per-stage so a single
   * user's failure doesn't stop their later steps or the other users.
   */
  async function processUser(u: {
    id: string;
    email: string | null;
    quickbooks_token: QuickBooksToken | null;
    gmail_token: GmailToken | null;
  }) {
    const uid = u.id;
    try {
      let qb = u.quickbooks_token;
      try {
        qb = await ensureQuickBooksToken(qb);
        if (qb) {
          await admin
            .from("users")
            .update({ quickbooks_token: qb as unknown as Record<string, unknown> })
            .eq("id", uid);
          await syncInvoicesForUser(admin, uid, qb);
          await admin
            .from("users")
            .update({
              quickbooks_synced_at: new Date().toISOString(),
              quickbooks_sync_error: null,
              quickbooks_sync_error_at: null,
            })
            .eq("id", uid);
        }
      } catch (syncErr) {
        const message =
          syncErr instanceof Error ? syncErr.message : "QuickBooks sync failed";
        await admin
          .from("users")
          .update({
            quickbooks_sync_error: message.slice(0, 500),
            quickbooks_sync_error_at: new Date().toISOString(),
          })
          .eq("id", uid);
        logError({
          route: "cron.daily",
          event: "quickbooks.sync_failed",
          userId: uid,
          err: syncErr,
        });
      }

      // Settings can be missing (user signed up but `handle_new_user`
      // trigger never inserted a row). maybeSingle() returns null instead
      // of throwing.
      const { data: settings } = await admin
        .from("settings")
        .select("auto_send_enabled")
        .eq("user_id", uid)
        .maybeSingle();

      const r = await processDailyReminders(
        admin,
        {
          id: uid,
          email: u.email,
          quickbooks_token: qb,
          gmail_token: u.gmail_token,
        },
        {
          auto_send_enabled: Boolean(settings?.auto_send_enabled),
        }
      );
      results[uid] = {
        reminders: `sent ${r.sent} queued ${r.queued} skipped ${r.skipped}`,
      };
      logInfo({
        route: "cron.daily",
        event: "user.processed",
        userId: uid,
        sent: r.sent,
        queued: r.queued,
        skipped: r.skipped,
      });
    } catch (e) {
      results[uid] = { sync: e instanceof Error ? e.message : "error" };
      logError({
        route: "cron.daily",
        event: "user.processing_failed",
        userId: uid,
        err: e,
      });
    }
  }

  // Process users in parallel chunks. With sequential processing a slow QB
  // tenant could time out Vercel's 60s function limit before reaching later
  // users; chunked parallel keeps the cron fast and prevents starvation.
  const CHUNK = 5;
  const list = (users ?? []) as Array<{
    id: string;
    email: string | null;
    quickbooks_token: QuickBooksToken | null;
    gmail_token: GmailToken | null;
  }>;
  for (let i = 0; i < list.length; i += CHUNK) {
    const slice = list.slice(i, i + CHUNK);
    await Promise.all(slice.map(processUser));
  }

  return NextResponse.json({ ok: true, results, count: list.length });
}

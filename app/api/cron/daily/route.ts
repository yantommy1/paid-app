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
  const { data: users, error } = await admin.from("users").select("*");
  if (error) {
    return serverError(error.message);
  }

  const results: Record<string, { sync?: string; reminders?: string }> = {};

  for (const u of users ?? []) {
    const uid = u.id as string;
    try {
      let qb = u.quickbooks_token as QuickBooksToken | null;
      try {
        qb = await ensureQuickBooksToken(qb);
        if (qb) {
          await admin
            .from("users")
            .update({ quickbooks_token: qb as unknown as Record<string, unknown> })
            .eq("id", uid);
          await syncInvoicesForUser(admin, uid, qb);
          // Successful sync — clear any prior error banner the dashboard
          // is showing, and stamp the success time.
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
        // Sync failure should not block draft pre-warm — log, persist a
        // human-readable banner message on the user row, and continue.
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

      const { data: settings } = await admin
        .from("settings")
        .select("*")
        .eq("user_id", uid)
        .single();

      const r = await processDailyReminders(
        admin,
        {
          id: uid,
          email: u.email as string | null,
          quickbooks_token: qb,
          gmail_token: u.gmail_token as GmailToken | null,
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
      results[uid] = {
        sync: e instanceof Error ? e.message : "error",
      };
      logError({
        route: "cron.daily",
        event: "user.processing_failed",
        userId: uid,
        err: e,
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}

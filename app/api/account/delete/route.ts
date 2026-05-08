import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import type { GmailToken, QuickBooksToken } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Account deletion — Limited Use disclosure (privacy policy) commits to this.
 *
 * Deletes the auth.users row, which cascades to every public table referencing it.
 * Best-effort revokes Gmail + QuickBooks OAuth tokens at the issuer so they
 * cannot be used after we drop them from our DB.
 *
 * Confirmation pattern: the caller must POST { confirm_email } that exactly
 * matches the signed-in user's email. This protects against accidental clicks
 * (we render the confirmation in the UI; the user retypes the email).
 */
const BodySchema = z.object({
  confirm_email: z.string().email(),
});

async function revokeGoogleToken(token: GmailToken | null): Promise<void> {
  if (!token?.refresh_token) return;
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token.refresh_token }).toString(),
    });
  } catch {
    // Best-effort — local deletion proceeds regardless.
  }
}

async function revokeQuickBooksToken(token: QuickBooksToken | null): Promise<void> {
  if (!token?.refresh_token) return;
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;
  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token: token.refresh_token }),
    });
  } catch {
    // Best-effort.
  }
}

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

  const userEmail = (ctx.user.email ?? "").trim().toLowerCase();
  const confirmEmail = parsed.data.confirm_email.trim().toLowerCase();
  if (!userEmail || userEmail !== confirmEmail) {
    return serverError("Confirmation email did not match.", 400);
  }

  const supabase = await createRouteHandlerClient(request);
  const { data: profile } = await supabase
    .from("users")
    .select("gmail_token, quickbooks_token")
    .eq("id", ctx.user.id)
    .maybeSingle();

  // Revoke at issuer first. Failures are non-fatal — if the user's token is
  // already invalid, the issuer returns 400; we still want to delete our copy.
  await Promise.all([
    revokeGoogleToken((profile?.gmail_token as GmailToken | null) ?? null),
    revokeQuickBooksToken(
      (profile?.quickbooks_token as QuickBooksToken | null) ?? null
    ),
  ]);

  // Cascade delete via auth.users → public.users → invoices/settings/fees/
  // reminder_logs/api_keys/reply_classifications/reminder_schedules/
  // bookkeeper_invites. Every table FK references public.users(id) ON DELETE
  // CASCADE, and public.users(id) FK references auth.users(id) ON DELETE
  // CASCADE — so a single auth admin delete wipes everything.
  const admin = createAdminClient();
  const { error: delErr } = await admin.auth.admin.deleteUser(ctx.user.id);
  if (delErr) {
    console.error("[account/delete] auth.admin.deleteUser failed", {
      userId: ctx.user.id,
      message: delErr.message,
    });
    return serverError(
      "Could not delete account. Contact support@paid-app.com.",
      500
    );
  }

  return NextResponse.json(
    { ok: true, deleted_at: new Date().toISOString() },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

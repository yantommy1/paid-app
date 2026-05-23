import { apiError, serverError, unauthorized } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { getAppUrl } from "@/lib/env/app-url";
import { isSafeInternalPath } from "@/lib/http/safe-internal-path";
import { logError, logInfo } from "@/lib/observability/log";
import { syncInvoicesForUser } from "@/lib/quickbooks/sync";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuickBooksToken } from "@/lib/types";
import { cookies } from "next/headers";
import { after, NextRequest, NextResponse } from "next/server";

const QB_AUTH = "https://appcenter.intuit.com/connect/oauth2";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  if (error) {
    return serverError(String(error), 400);
  }

  if (!code) {
    if (!process.env.QUICKBOOKS_CLIENT_ID || !process.env.QUICKBOOKS_CLIENT_SECRET) {
      return apiError("QuickBooks is not configured.", "SERVER_ERROR", 500);
    }
    const cookieStore = await cookies();
    const st = crypto.randomUUID();
    cookieStore.set("qb_oauth_state", st, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    const returnTo = url.searchParams.get("return_to");
    if (returnTo && isSafeInternalPath(returnTo)) {
      cookieStore.set("qb_oauth_return", returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600,
      });
    }
    const redirectUri = `${getAppUrl()}/api/auth/quickbooks`;
    const params = new URLSearchParams({
      client_id: process.env.QUICKBOOKS_CLIENT_ID!,
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: redirectUri,
      state: st,
    });
    return NextResponse.redirect(`${QB_AUTH}?${params.toString()}`);
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("qb_oauth_state")?.value;
  if (!state || expected !== state) {
    return serverError("Invalid OAuth state", 400);
  }
  cookieStore.delete("qb_oauth_state");

  const redirectUri = `${getAppUrl()}/api/auth/quickbooks`;
  // Must use /tokens/bearer — POST /oauth2/v1/tokens alone returns 404 from Intuit.
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const responseBodyText = await tokenRes.text();

  if (!tokenRes.ok) {
    return apiError("Could not connect to QuickBooks. Please try again.", "SERVER_ERROR", 400);
  }

  let tok: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    realmId?: string;
  };
  try {
    tok = JSON.parse(responseBodyText) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      realmId?: string;
    };
  } catch {
    return apiError("QuickBooks returned an invalid response.", "SERVER_ERROR", 502);
  }

  const resolvedRealm = realmId ?? tok.realmId ?? "";

  const qbToken: QuickBooksToken = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + tok.expires_in * 1000,
    realm_id: resolvedRealm,
  };

  if (!qbToken.realm_id) {
    return NextResponse.json(
      {
        error: "Missing realmId (QuickBooks company). Reconnect from QuickBooks.",
        code: "SERVER_ERROR",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from("users")
    .update({ quickbooks_token: qbToken as unknown as Record<string, unknown> })
    .eq("id", user.id);

  if (upErr) {
    return serverError(upErr.message);
  }

  // Kick off the initial invoice sync after the response sends. Without this
  // the merchant just connected QB, lands on Dashboard, and sees an empty
  // table for up to 24h (until daily cron) — destroying the first-30-min
  // wow moment. `after()` defers the work past the redirect so the user
  // doesn't wait on the QB query API.
  const userId = user.id;
  after(async () => {
    try {
      await syncInvoicesForUser(admin, userId, qbToken);
      await admin
        .from("users")
        .update({
          quickbooks_synced_at: new Date().toISOString(),
          quickbooks_sync_error: null,
          quickbooks_sync_error_at: null,
        })
        .eq("id", userId);
      logInfo({
        route: "auth.quickbooks",
        event: "initial_sync.complete",
        userId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Initial QuickBooks sync failed";
      await admin
        .from("users")
        .update({
          quickbooks_sync_error: message.slice(0, 500),
          quickbooks_sync_error_at: new Date().toISOString(),
        })
        .eq("id", userId);
      logError({
        route: "auth.quickbooks",
        event: "initial_sync.failed",
        userId,
        err,
      });
    }
  });

  const cookieStoreAfter = await cookies();
  const returnPath = cookieStoreAfter.get("qb_oauth_return")?.value;
  cookieStoreAfter.delete("qb_oauth_return");

  let next = `${getAppUrl()}/onboarding?step=quickbooks-done`;
  if (returnPath && isSafeInternalPath(returnPath)) {
    const sep = returnPath.includes("?") ? "&" : "?";
    next = `${getAppUrl()}${returnPath}${sep}connected=quickbooks`;
  }
  return NextResponse.redirect(next);
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from("users")
    .update({ quickbooks_token: null })
    .eq("id", ctx.user.id);

  if (upErr) {
    return serverError(upErr.message);
  }

  return NextResponse.json({ ok: true });
}

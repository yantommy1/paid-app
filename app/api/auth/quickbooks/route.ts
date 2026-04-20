import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { getAppUrl } from "@/lib/env/app-url";
import { isSafeInternalPath } from "@/lib/http/safe-internal-path";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuickBooksToken } from "@/lib/types";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const QB_AUTH = "https://appcenter.intuit.com/connect/oauth2";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
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
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
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
    let parsed: Record<string, unknown> | null = null;
    if (responseBodyText) {
      try {
        parsed = JSON.parse(responseBodyText) as Record<string, unknown>;
      } catch {
        // Intuit sometimes returns non-JSON; keep raw text only
      }
    }

    const intuitError =
      typeof parsed?.error === "string" ? parsed.error : undefined;
    const intuitDescription =
      typeof parsed?.error_description === "string"
        ? parsed.error_description
        : undefined;

    const diagnostic = {
      step: "token_exchange",
      httpStatus: tokenRes.status,
      httpStatusText: tokenRes.statusText,
      redirectUriUsed: redirectUri,
      responseContentType: tokenRes.headers.get("content-type"),
      rawBodyLength: responseBodyText.length,
      rawBody: responseBodyText || "(empty)",
      intuitError,
      intuitDescription,
      intuitParsed: parsed,
    };

    console.error("[QuickBooks OAuth] Token exchange failed", diagnostic);

    return NextResponse.json(
      {
        error: "Token exchange failed",
        message:
          (intuitDescription ?? intuitError ?? responseBodyText) ||
          tokenRes.statusText,
        ...diagnostic,
      },
      { status: 400 }
    );
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
  } catch (parseErr) {
    const diagnostic = {
      step: "parse_token_response",
      httpStatus: tokenRes.status,
      rawBodyPreview: responseBodyText.slice(0, 500),
    };
    console.error("[QuickBooks OAuth] Success response was not valid JSON", diagnostic, parseErr);
    return NextResponse.json(
      {
        error: "Token response was not valid JSON",
        ...diagnostic,
      },
      { status: 502 }
    );
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
      { error: "Missing realmId (QuickBooks company). Reconnect from QuickBooks." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from("users")
    .update({ quickbooks_token: qbToken as unknown as Record<string, unknown> })
    .eq("id", user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

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
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

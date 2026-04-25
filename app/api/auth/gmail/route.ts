import { serverError, unauthorized } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { getAppUrl } from "@/lib/env/app-url";
import { isSafeInternalPath } from "@/lib/http/safe-internal-path";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GmailToken } from "@/lib/types";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

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
  const error = url.searchParams.get("error");

  if (error) {
    return serverError(String(error), 400);
  }

  if (!code) {
    const cookieStore = await cookies();
    const st = crypto.randomUUID();
    cookieStore.set("gmail_oauth_state", st, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    const returnTo = url.searchParams.get("return_to");
    if (returnTo && isSafeInternalPath(returnTo)) {
      cookieStore.set("gmail_oauth_return", returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600,
      });
    }
    const redirectUri = `${getAppUrl()}/api/auth/gmail`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state: st,
    });
    return NextResponse.redirect(`${GOOGLE_AUTH}?${params.toString()}`);
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("gmail_oauth_state")?.value;
  if (!state || expected !== state) {
    return serverError("Invalid OAuth state", 400);
  }
  cookieStore.delete("gmail_oauth_state");

  const redirectUri = `${getAppUrl()}/api/auth/gmail`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return NextResponse.json(
      { error: "Token exchange failed", code: "SERVER_ERROR", detail: t },
      { status: 400 }
    );
  }

  const tok = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const gmailToken: GmailToken = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? "",
    expires_at: Date.now() + tok.expires_in * 1000,
  };

  if (!gmailToken.refresh_token) {
    return NextResponse.json(
      {
        error:
          "No refresh token returned. Revoke app access in Google Account settings and try again with prompt=consent.",
        code: "SERVER_ERROR",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from("users")
    .update({ gmail_token: gmailToken as unknown as Record<string, unknown> })
    .eq("id", user.id);

  if (upErr) {
    return serverError(upErr.message);
  }

  const cookieStoreAfter = await cookies();
  const returnPath = cookieStoreAfter.get("gmail_oauth_return")?.value;
  cookieStoreAfter.delete("gmail_oauth_return");

  let next = `${getAppUrl()}/onboarding?step=gmail-done`;
  if (returnPath && isSafeInternalPath(returnPath)) {
    const sep = returnPath.includes("?") ? "&" : "?";
    next = `${getAppUrl()}${returnPath}${sep}connected=gmail`;
  }
  return NextResponse.redirect(next);
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from("users")
    .update({ gmail_token: null })
    .eq("id", ctx.user.id);

  if (upErr) {
    return serverError(upErr.message);
  }

  return NextResponse.json({ ok: true });
}

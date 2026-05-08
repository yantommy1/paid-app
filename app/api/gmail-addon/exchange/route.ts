import { serverError, unauthorized } from "@/lib/api/errors";
import { logError, logInfo } from "@/lib/observability/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Identity-based auth for the Gmail Add-On.
 *
 * The Apps Script add-on calls ScriptApp.getIdentityToken() to get a Google-
 * signed ID token bound to the active Workspace user. It POSTs that token
 * here. We verify it via Google's tokeninfo endpoint, require the email is
 * verified, look up the matching Supabase user, and return that user's API
 * key — provisioning one on first contact.
 *
 * Security model:
 *   - tokeninfo verifies the signature, expiration, and issuer for us.
 *   - We additionally require `email_verified === "true"` (string in tokeninfo
 *     output) and that the issuer claim is Google's accounts.google.com.
 *   - We do NOT trust client-supplied emails — only what tokeninfo returns
 *     after Google has verified the JWT signature.
 *
 * No-account path:
 *   - If the verified Google email has no matching Paid account, we return
 *     404 with a JSON code so the add-on can render "Sign up at paid-app.com"
 *     instead of looping.
 *
 * On success:
 *   - Returns { api_key, created_at, identity:"google" }. The add-on stores
 *     the key in UserProperties exactly as the manual flow does today, so
 *     the rest of the request path is unchanged.
 *
 * Cost:
 *   - One outbound HTTP call to https://oauth2.googleapis.com/tokeninfo per
 *     exchange. Add-on caches the resulting API key for ~30 days, so this
 *     endpoint is hit roughly once-per-user-per-month. Plenty under
 *     tokeninfo's per-IP rate limit.
 */

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

type TokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  iss?: string;
  sub?: string;
  exp?: string;
  error?: string;
  error_description?: string;
};

async function verifyGoogleIdToken(idToken: string): Promise<
  | { ok: true; email: string; sub: string }
  | { ok: false; reason: string }
> {
  const url = `${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { method: "GET" });
  } catch (err) {
    return {
      ok: false,
      reason: `tokeninfo network error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
  if (!resp.ok) {
    return { ok: false, reason: `tokeninfo HTTP ${resp.status}` };
  }
  let info: TokenInfo;
  try {
    info = (await resp.json()) as TokenInfo;
  } catch {
    return { ok: false, reason: "tokeninfo returned non-JSON" };
  }
  if (info.error) {
    return { ok: false, reason: `tokeninfo: ${info.error}` };
  }
  if (!info.iss || !VALID_ISSUERS.has(info.iss)) {
    return { ok: false, reason: `unexpected issuer: ${info.iss ?? "(missing)"}` };
  }
  // tokeninfo returns email_verified as a string "true"/"false" historically,
  // but newer responses use boolean. Accept both.
  const verified =
    info.email_verified === true || info.email_verified === "true";
  if (!verified) {
    return { ok: false, reason: "email not verified" };
  }
  if (!info.email || !info.sub) {
    return { ok: false, reason: "missing email or sub in token" };
  }

  // Optional aud allowlist — if set, require the token was issued for one of
  // our known clients. Set PAID_GADDON_AUD to the script's OAuth client ID
  // (find it in Google Cloud Console for the project the add-on lives under).
  const allowedAud = process.env.PAID_GADDON_AUD;
  if (allowedAud) {
    const allowed = allowedAud.split(",").map((s) => s.trim()).filter(Boolean);
    if (info.aud && !allowed.includes(info.aud)) {
      return { ok: false, reason: `aud not allowed: ${info.aud}` };
    }
  }

  return { ok: true, email: info.email.trim().toLowerCase(), sub: info.sub };
}

export async function POST(request: NextRequest) {
  // Identity token can come from the Authorization header (preferred) or the
  // JSON body. Header is cleaner; body keeps clasp-pasteable testing simple.
  const authHeader = request.headers.get("authorization");
  let idToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

  if (!idToken) {
    try {
      const body = (await request.json()) as { id_token?: string };
      if (typeof body?.id_token === "string" && body.id_token.trim()) {
        idToken = body.id_token.trim();
      }
    } catch {
      // No body, no token — fall through to the unauthorized response below.
    }
  }
  if (!idToken) {
    return unauthorized("Missing Google identity token");
  }

  const verified = await verifyGoogleIdToken(idToken);
  if (!verified.ok) {
    logError({
      route: "gmail-addon.exchange",
      event: "verify_failed",
      reason: verified.reason,
    });
    return unauthorized("Identity token verification failed");
  }

  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("id, email")
    .eq("email", verified.email)
    .maybeSingle();
  if (profileErr) {
    return serverError(profileErr.message);
  }
  if (!profile?.id) {
    return NextResponse.json(
      {
        error:
          "No Paid account for this Google address. Sign up at https://paid-app.com first.",
        code: "NO_ACCOUNT",
        email: verified.email,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Reuse an existing key if present so the add-on doesn't churn keys on
  // every reconnect; otherwise mint one. The /api/auth/api-key/refresh path
  // is still available for explicit rotation from /settings.
  const { data: existing } = await admin
    .from("api_keys")
    .select("key, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.key) {
    logInfo({
      route: "gmail-addon.exchange",
      event: "reused_existing",
      userId: profile.id,
    });
    return NextResponse.json(
      {
        api_key: existing.key,
        created_at: existing.created_at,
        identity: "google",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const newKey = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { error: insErr } = await admin.from("api_keys").insert({
    user_id: profile.id,
    key: newKey,
    created_at: createdAt,
  });
  if (insErr) {
    logError({
      route: "gmail-addon.exchange",
      event: "key_insert_failed",
      userId: profile.id,
      err: insErr.message,
    });
    return serverError(insErr.message);
  }

  logInfo({
    route: "gmail-addon.exchange",
    event: "minted_key",
    userId: profile.id,
  });

  return NextResponse.json(
    { api_key: newKey, created_at: createdAt, identity: "google" },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}

import type { GmailToken, QuickBooksToken } from "@/lib/types";

/** Intuit OAuth token + refresh endpoint (not .../tokens — that path 404s). */
const QB_BASE = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export async function refreshQuickBooksToken(
  refreshToken: string
): Promise<QuickBooksToken> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID!;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(QB_BASE, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`QuickBooks token refresh failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const expires_at = Date.now() + data.expires_in * 1000;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at,
    realm_id: "", // caller merges existing realm_id
  };
}

export async function refreshGmailToken(refreshToken: string): Promise<GmailToken> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function ensureQuickBooksToken(
  stored: QuickBooksToken | null
): Promise<QuickBooksToken | null> {
  if (!stored?.refresh_token || !stored.realm_id) return null;
  if (stored.expires_at > Date.now() + 60_000) {
    return stored;
  }
  const next = await refreshQuickBooksToken(stored.refresh_token);
  return { ...next, realm_id: stored.realm_id };
}

export async function ensureGmailToken(
  stored: GmailToken | null
): Promise<GmailToken | null> {
  if (!stored?.refresh_token) return null;
  if (stored.expires_at > Date.now() + 60_000) {
    return stored;
  }
  return refreshGmailToken(stored.refresh_token);
}

/** Supabase user JWTs are standard three-segment JWTs. */
export function bearerLooksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * RFC 4122 UUID (any version) — matches `api_keys.key` / `crypto.randomUUID()`.
 * We intentionally do not require UUID v4 only; Postgres accepts any valid UUID.
 */
const RFC4122_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bearerLooksLikeRfc4122Uuid(token: string): boolean {
  return RFC4122_UUID.test(token.trim());
}

/** @deprecated use bearerLooksLikeRfc4122Uuid — kept for call sites */
export function bearerLooksLikePaidApiKey(token: string): boolean {
  return bearerLooksLikeRfc4122Uuid(token);
}

/** Strip whitespace and common copy/paste quotes around the token. */
export function normalizeBearerToken(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw).trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t.length ? t : null;
}

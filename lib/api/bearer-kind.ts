/** Supabase user JWTs are standard three-segment JWTs. */
export function bearerLooksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** Paid API keys are random UUID v4 strings stored in `api_keys.key`. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function bearerLooksLikePaidApiKey(token: string): boolean {
  return UUID_V4.test(token.trim());
}

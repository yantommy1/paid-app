/**
 * Canonical site origin with no trailing slash.
 * OAuth providers require redirect_uri to match registered URIs exactly;
 * a trailing slash in NEXT_PUBLIC_APP_URL would produce `//api/...` and fail.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

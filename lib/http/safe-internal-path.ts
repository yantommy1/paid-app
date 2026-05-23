/** Same-origin path + query only — safe to use after OAuth as a redirect target. */
export function isSafeInternalPath(p: string): boolean {
  if (typeof p !== "string" || p.length > 512) return false;
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  if (p.includes("://") || p.includes("\\")) return false;
  return true;
}

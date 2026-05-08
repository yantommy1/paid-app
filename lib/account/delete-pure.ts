/**
 * Confirmation matcher for /api/account/delete. Pure so the test can lock in
 * the case-insensitive + whitespace-trimmed match without spinning a server.
 */
export function confirmEmailMatches(
  userEmail: string | null | undefined,
  confirmEmail: string | null | undefined
): boolean {
  const u = (userEmail ?? "").trim().toLowerCase();
  const c = (confirmEmail ?? "").trim().toLowerCase();
  if (!u || !c) return false;
  return u === c;
}

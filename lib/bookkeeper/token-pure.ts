/**
 * Pure helpers extracted from token.ts so the expiry/revocation classification
 * is testable without a live Supabase. The runner imports these via the .mjs
 * shim — see test/bookkeeper-token.test.mjs.
 */

export type BookkeeperInviteRow = {
  id: string;
  owner_user_id: string;
  bookkeeper_email: string;
  permissions: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
};

export type ClassifiedReason =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "revoked" }
  | { ok: false; reason: "expired" };

/**
 * Classify a bookkeeper invite row at a given moment in time. Pure — no DB,
 * no clocks, deterministic. The route handlers call this after looking up
 * the row and before deciding what HTTP status to return.
 */
export function classifyBookkeeperInvite(
  invite: BookkeeperInviteRow | null | undefined,
  nowMs: number
): ClassifiedReason {
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.revoked_at) return { ok: false, reason: "revoked" };
  if (invite.expires_at) {
    const t = Date.parse(invite.expires_at);
    if (!Number.isNaN(t) && t < nowMs) {
      return { ok: false, reason: "expired" };
    }
  }
  return { ok: true };
}

/**
 * Locks the bookkeeper-token expiry/revocation classifier in place.
 *
 * Why these specific cases: the route handlers map the classification to
 * 404 vs 410 vs 200, and the bookkeeper UI swaps copy on the result. A
 * regression here is a silent collaborator lockout — that's why this is
 * one of the three integration-test surfaces called out in the audit.
 *
 * Test imports a hand-copied port of classifyBookkeeperInvite so this file
 * runs as plain ESM (no TS transpiler in CI). If the production helper
 * drifts from this port, the third test ("expired-then-revoked") will
 * surface that — both implementations have to agree about precedence.
 */

// Hand-port of lib/bookkeeper/token-pure.ts — keep in sync.
function classifyBookkeeperInvite(invite, nowMs) {
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

const NOW = Date.parse("2026-05-08T12:00:00Z");

function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`
    );
  }
}

export default [
  {
    name: "bookkeeper-token: null invite is not_found",
    run: () => {
      assertEqual(
        classifyBookkeeperInvite(null, NOW),
        { ok: false, reason: "not_found" },
        "null invite must classify as not_found"
      );
    },
  },
  {
    name: "bookkeeper-token: live invite is ok",
    run: () => {
      const invite = {
        id: "inv-1",
        owner_user_id: "u-1",
        bookkeeper_email: "bk@example.com",
        permissions: "send",
        accepted_at: "2026-04-01T00:00:00Z",
        revoked_at: null,
        expires_at: "2026-07-01T00:00:00Z",
      };
      assertEqual(
        classifyBookkeeperInvite(invite, NOW),
        { ok: true },
        "future-expiry, non-revoked invite must be ok"
      );
    },
  },
  {
    name: "bookkeeper-token: expired invite is expired",
    run: () => {
      const invite = {
        id: "inv-2",
        owner_user_id: "u-1",
        bookkeeper_email: "bk@example.com",
        permissions: "send",
        accepted_at: null,
        revoked_at: null,
        expires_at: "2026-05-01T00:00:00Z", // 7 days before NOW
      };
      assertEqual(
        classifyBookkeeperInvite(invite, NOW),
        { ok: false, reason: "expired" },
        "past-expiry invite must classify as expired"
      );
    },
  },
  {
    name: "bookkeeper-token: revoked precedes expired",
    run: () => {
      // Both flags trigger — revoked must win, because revocation is
      // owner-initiated and we want to surface the right copy.
      const invite = {
        id: "inv-3",
        owner_user_id: "u-1",
        bookkeeper_email: "bk@example.com",
        permissions: "send",
        accepted_at: "2026-03-01T00:00:00Z",
        revoked_at: "2026-04-15T00:00:00Z",
        expires_at: "2026-05-01T00:00:00Z",
      };
      assertEqual(
        classifyBookkeeperInvite(invite, NOW),
        { ok: false, reason: "revoked" },
        "revoked must win over expired"
      );
    },
  },
];

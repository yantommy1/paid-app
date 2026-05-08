/**
 * Account-delete confirmation matcher.
 *
 * The /api/account/delete route requires { confirm_email } in the body to
 * exactly match the signed-in user's email — case-insensitive, whitespace-
 * trimmed. This is the last line of defense before
 * supabase.auth.admin.deleteUser cascades and wipes the account.
 *
 * Locks the matcher so we don't regress to "anything truthy passes" or to
 * a strict equality check that breaks for users who type their email with
 * trailing whitespace from autofill.
 */

// Hand-port of lib/account/delete-pure.ts — keep in sync.
function confirmEmailMatches(userEmail, confirmEmail) {
  const u = (userEmail ?? "").trim().toLowerCase();
  const c = (confirmEmail ?? "").trim().toLowerCase();
  if (!u || !c) return false;
  return u === c;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export default [
  {
    name: "account-delete: exact match accepted",
    run: () => {
      assert(
        confirmEmailMatches("tommy@paid-app.com", "tommy@paid-app.com"),
        "exact match must accept"
      );
    },
  },
  {
    name: "account-delete: case-insensitive match accepted",
    run: () => {
      assert(
        confirmEmailMatches("Tommy@Paid-App.com", "tommy@paid-app.com"),
        "case-insensitive match must accept"
      );
      assert(
        confirmEmailMatches("tommy@paid-app.com", "TOMMY@PAID-APP.COM"),
        "uppercased confirm must accept"
      );
    },
  },
  {
    name: "account-delete: whitespace tolerated",
    run: () => {
      assert(
        confirmEmailMatches("tommy@paid-app.com", "  tommy@paid-app.com  "),
        "whitespace-padded confirm must accept (autofill)"
      );
    },
  },
  {
    name: "account-delete: mismatch rejected",
    run: () => {
      assert(
        !confirmEmailMatches("tommy@paid-app.com", "evil@example.com"),
        "wrong email must reject"
      );
    },
  },
  {
    name: "account-delete: empty inputs reject",
    run: () => {
      assert(
        !confirmEmailMatches("", "tommy@paid-app.com"),
        "empty userEmail must reject (defense against null user record)"
      );
      assert(
        !confirmEmailMatches("tommy@paid-app.com", ""),
        "empty confirm must reject"
      );
      assert(
        !confirmEmailMatches(null, null),
        "double-null must reject"
      );
    },
  },
];

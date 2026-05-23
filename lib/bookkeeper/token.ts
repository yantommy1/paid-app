import { createAdminClient } from "@/lib/supabase/admin";
import { classifyBookkeeperInvite } from "@/lib/bookkeeper/token-pure";

export type BookkeeperContext = {
  ownerUserId: string;
  bookkeeperEmail: string;
  inviteId: string;
  permissions: "review" | "send";
};

/**
 * Discriminated return shape so callers can distinguish "the token was never
 * valid" from "the token was once valid but lapsed". Bookkeeper UI surfaces
 * the owner's email on expiry so the bookkeeper knows who to ask for a new
 * link — silent 401s used to land them on a generic "no longer active" page
 * with no path forward.
 */
export type BookkeeperResolution =
  | { ok: true; ctx: BookkeeperContext }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "revoked"; ownerEmail: string | null }
  | { ok: false; reason: "expired"; ownerEmail: string | null };

async function lookupOwnerEmail(ownerUserId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("email")
    .eq("id", ownerUserId)
    .maybeSingle();
  return (data?.email as string | null | undefined) ?? null;
}

/**
 * Validate a bookkeeper magic-link token. Returns `{ok:true, ctx}` on success,
 * or `{ok:false, reason}` with optional ownerEmail for the UI on failure.
 *
 * Touches `last_access_at` and `accepted_at` (first time) when valid.
 */
export async function resolveBookkeeperTokenDetailed(
  token: string
): Promise<BookkeeperResolution> {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "not_found" };
  }
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("bookkeeper_invites")
    .select(
      "id, owner_user_id, bookkeeper_email, permissions, accepted_at, revoked_at, expires_at"
    )
    .eq("token", token)
    .maybeSingle();

  // Delegate the time-and-flag check to the pure classifier so tests can
  // lock its behavior without a live DB.
  const classification = classifyBookkeeperInvite(invite, Date.now());
  if (!classification.ok) {
    if (classification.reason === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    return {
      ok: false,
      reason: classification.reason,
      ownerEmail: invite ? await lookupOwnerEmail(invite.owner_user_id) : null,
    };
  }

  // Classifier ok=true implies invite is non-null, but TS can't infer the
  // cross-function narrowing — explicit guard keeps types honest.
  if (!invite) {
    return { ok: false, reason: "not_found" };
  }

  const now = new Date().toISOString();
  await admin
    .from("bookkeeper_invites")
    .update({
      last_access_at: now,
      accepted_at: invite.accepted_at ?? now,
    })
    .eq("id", invite.id);

  return {
    ok: true,
    ctx: {
      ownerUserId: invite.owner_user_id,
      bookkeeperEmail: invite.bookkeeper_email,
      inviteId: invite.id,
      permissions: (invite.permissions as "review" | "send") ?? "review",
    },
  };
}

/**
 * Backwards-compatible wrapper for call sites that only need the context or
 * null. New code should prefer resolveBookkeeperTokenDetailed so it can
 * branch on the failure reason and surface the owner's email.
 */
export async function resolveBookkeeperToken(
  token: string
): Promise<BookkeeperContext | null> {
  const r = await resolveBookkeeperTokenDetailed(token);
  return r.ok ? r.ctx : null;
}

import { createAdminClient } from "@/lib/supabase/admin";

export type BookkeeperContext = {
  ownerUserId: string;
  bookkeeperEmail: string;
  inviteId: string;
  permissions: "review" | "send";
};

/**
 * Validate a bookkeeper magic-link token and return the owner context the bookkeeper
 * is allowed to act on. Returns null if invalid / revoked / expired.
 *
 * Touches `last_access_at` and `accepted_at` (first time) when valid.
 */
export async function resolveBookkeeperToken(
  token: string
): Promise<BookkeeperContext | null> {
  if (!token || typeof token !== "string") return null;
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("bookkeeper_invites")
    .select(
      "id, owner_user_id, bookkeeper_email, permissions, accepted_at, revoked_at, expires_at"
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite) return null;
  if (invite.revoked_at) return null;
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return null;
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
    ownerUserId: invite.owner_user_id,
    bookkeeperEmail: invite.bookkeeper_email,
    inviteId: invite.id,
    permissions: (invite.permissions as "review" | "send") ?? "review",
  };
}

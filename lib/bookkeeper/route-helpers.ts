import { apiError } from "@/lib/api/errors";
import {
  resolveBookkeeperTokenDetailed,
  type BookkeeperContext,
} from "@/lib/bookkeeper/token";
import { NextResponse } from "next/server";

/**
 * Resolve a bookkeeper token for an API route, returning either a context the
 * route can act on or an HTTP response with the right status + payload for
 * the bookkeeper UI to render a friendly message.
 *
 * Status mapping:
 *   not_found → 404 (with no ownerEmail, since we don't know who owns nothing)
 *   revoked   → 410 Gone (with ownerEmail so the bookkeeper can ask for renewal)
 *   expired   → 410 Gone (same)
 *
 * 410 is the right code per RFC 7231: "the resource is intentionally and
 * permanently unavailable" with the implication that the user should not
 * retry. The bookkeeper UI uses the JSON code field to switch the copy.
 */
export async function resolveBookkeeperOrErrorResponse(
  token: string
): Promise<
  | { ok: true; ctx: BookkeeperContext }
  | { ok: false; response: NextResponse }
> {
  const r = await resolveBookkeeperTokenDetailed(token);
  if (r.ok) return { ok: true, ctx: r.ctx };
  if (r.reason === "not_found") {
    return {
      ok: false,
      response: apiError("This bookkeeper link is invalid.", "NOT_FOUND", 404),
    };
  }
  // Revoked or expired — return 410 with ownerEmail so the UI can route the
  // bookkeeper to request a fresh link.
  const message =
    r.reason === "expired"
      ? "This bookkeeper link has expired."
      : "This bookkeeper link has been revoked.";
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: message,
        code: r.reason === "expired" ? "EXPIRED" : "REVOKED",
        ownerEmail: r.ownerEmail,
      },
      { status: 410 }
    ),
  };
}

import {
  bearerLooksLikeJwt,
  bearerLooksLikeRfc4122Uuid,
  normalizeBearerToken,
} from "@/lib/api/bearer-kind";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Resolve Supabase user from cookie session (browser) or Authorization Bearer:
 * Paid API key (RFC 4122 UUID in `api_keys`) or Supabase JWT.
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<{ user: User | null; error: string | null }> {
  const authHeader = request.headers.get("authorization");
  const bearer = normalizeBearerToken(
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (bearer) {
    // UUID-shaped tokens are API keys (not valid JWTs — JWTs use dot separators).
    if (bearerLooksLikeRfc4122Uuid(bearer)) {
      const admin = createAdminClient();
      const { data: row, error: rowErr } = await admin
        .from("api_keys")
        .select("user_id")
        .eq("key", bearer)
        .maybeSingle();

      if (rowErr) {
        return { user: null, error: rowErr.message };
      }
      if (!row?.user_id) {
        return { user: null, error: "Invalid API key" };
      }

      const { data: adminUser, error: adminErr } =
        await admin.auth.admin.getUserById(row.user_id);

      if (adminErr || !adminUser.user) {
        return { user: null, error: adminErr?.message ?? "Invalid API key" };
      }
      return { user: adminUser.user, error: null };
    }

    if (bearerLooksLikeJwt(bearer)) {
      const supabase = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) return { user: null, error: error.message };
      return { user, error: null };
    }

    return {
      user: null,
      error: "Unsupported Authorization token",
    };
  }

  const { createClient: createServer } = await import("@/lib/supabase/server");
  const supabase = await createServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return { user: null, error: error.message };
  return { user, error: null };
}

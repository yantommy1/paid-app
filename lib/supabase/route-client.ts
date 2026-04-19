import { bearerLooksLikePaidApiKey } from "@/lib/api/bearer-kind";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Supabase client for route handlers — cookies (web), Bearer JWT, or Paid API key.
 * When the caller uses an API key, the client is the service-role client (RLS
 * bypassed); routes must scope every query with `user_id` from `requireUserFromRequest`.
 */
export async function createRouteHandlerClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearer) {
    if (bearerLooksLikePaidApiKey(bearer)) {
      return createAdminClient();
    }
    return createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
  }

  const { createClient: createServer } = await import("@/lib/supabase/server");
  return createServer();
}

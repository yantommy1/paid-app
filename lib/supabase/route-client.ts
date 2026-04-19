import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Supabase client scoped to the current user — cookies (web) or Bearer JWT (Gmail Add-On).
 */
export async function createRouteHandlerClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearer) {
    return createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
  }

  const { createClient: createServer } = await import("@/lib/supabase/server");
  return createServer();
}

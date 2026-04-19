import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Resolve Supabase user from cookie session (browser) or Authorization Bearer (Gmail Add-On / API).
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<{ user: User | null; error: string | null }> {
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (bearer) {
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

  const { createClient: createServer } = await import("@/lib/supabase/server");
  const supabase = await createServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return { user: null, error: error.message };
  return { user, error: null };
}

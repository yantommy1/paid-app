import { createClient } from "@/lib/supabase/server";
import { unauthorized } from "@/lib/api/errors";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function requireUser(): Promise<
  { user: User; error: null } | { user: null; error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      user: null,
      error: unauthorized(),
    };
  }
  return { user, error: null };
}

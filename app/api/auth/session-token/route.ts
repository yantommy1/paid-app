import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Returns the current Supabase access token for linking the Gmail Add-On.
 * Call from the browser while logged in; paste the token into the Add-On once.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.json({
    access_token: session.access_token,
    expires_at: session.expires_at,
  });
}

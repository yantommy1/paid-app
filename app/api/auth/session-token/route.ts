import { combineChunks, stringFromBase64URL } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Same prefix as `@supabase/ssr` when `cookieEncoding` is `base64url` (default). */
const BASE64_PREFIX = "base64-";

/**
 * Default auth storage cookie name — matches `SupabaseClient` / `createServerClient`
 * when `cookieOptions.name` is not set.
 * @see https://github.com/supabase/supabase-js/blob/master/src/SupabaseClient.ts
 */
function supabaseAuthCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const hostname = new URL(url).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}

/**
 * Reads the Supabase session from cookies: chunked `base64-` + base64url(JSON),
 * then returns only the raw `access_token` JWT for `Authorization: Bearer`.
 */
export async function GET() {
  const cookieStore = await cookies();
  const storageKey = supabaseAuthCookieName();

  const raw = await combineChunks(storageKey, async (chunkName) => {
    return cookieStore.get(chunkName)?.value ?? null;
  });

  if (!raw) {
    return textError("Not signed in", 401);
  }

  let jsonStr: string;
  if (typeof raw === "string" && raw.startsWith(BASE64_PREFIX)) {
    try {
      jsonStr = stringFromBase64URL(raw.slice(BASE64_PREFIX.length));
    } catch {
      return textError("Invalid session cookie encoding", 401);
    }
  } else {
    jsonStr = raw;
  }

  let session: { access_token?: unknown };
  try {
    session = JSON.parse(jsonStr) as { access_token?: unknown };
  } catch {
    return textError("Invalid session cookie JSON", 401);
  }

  const accessToken =
    typeof session.access_token === "string"
      ? session.access_token.trim()
      : "";

  if (!accessToken || accessToken.split(".").length !== 3) {
    return textError("No valid access token in session", 401);
  }

  return new NextResponse(accessToken, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function textError(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

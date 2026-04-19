import { requireUser } from "@/lib/api/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Create or rotate a Paid API key (browser session only).
 * Use the returned key as `Authorization: Bearer <uuid>` for the Gmail Add-On.
 */
export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;

  const admin = createAdminClient();
  await admin.from("api_keys").delete().eq("user_id", user.id);

  const key = crypto.randomUUID();
  const { error: insErr } = await admin.from("api_keys").insert({
    user_id: user.id,
    key,
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { api_key: key, created_at: new Date().toISOString() },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

/**
 * Return the current API key for the logged-in user (browser session only).
 */
export async function GET(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: qErr } = await admin
    .from("api_keys")
    .select("key, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const wantsPlain =
    request.nextUrl.searchParams.get("format") === "plain" ||
    (request.headers.get("accept")?.includes("text/plain") ?? false);

  if (!data?.key) {
    if (wantsPlain) {
      return new NextResponse(
        "No API key yet. Create one with POST /api/auth/api-key (e.g. from the web app).",
        { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    return NextResponse.json(
      { api_key: null, message: "No API key yet. POST to generate one." },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (wantsPlain) {
    return new NextResponse(data.key, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    { api_key: data.key, created_at: data.created_at },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

import { bearerLooksLikeRfc4122Uuid, normalizeBearerToken } from "@/lib/api/bearer-kind";
import { serverError, unauthorized } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Rotate an existing API key.
 * Authorization: Bearer <current-api-key>
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = normalizeBearerToken(
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  );

  if (!token || !bearerLooksLikeRfc4122Uuid(token)) {
    return unauthorized("Invalid API key");
  }

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("api_keys")
    .select("id, user_id")
    .eq("key", token)
    .maybeSingle();

  if (rowErr) return serverError(rowErr.message);
  if (!row?.user_id || !row.id) return unauthorized("Invalid API key");

  const { error: delErr } = await admin.from("api_keys").delete().eq("id", row.id);
  if (delErr) return serverError(delErr.message);

  const newKey = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { error: insErr } = await admin.from("api_keys").insert({
    user_id: row.user_id,
    key: newKey,
    created_at: createdAt,
  });

  if (insErr) return serverError(insErr.message);

  return NextResponse.json(
    { api_key: newKey, created_at: createdAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}

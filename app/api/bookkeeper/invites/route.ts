import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Bookkeeper invite — Paid does not call gmail.send. We create the invite
 * record and return the magic link to the owner; they share it with their
 * bookkeeper themselves (paste into Gmail, Slack, etc.).
 */
const InviteSchema = z.object({
  bookkeeper_email: z.string().email(),
  permissions: z.enum(["review", "send"]).optional(),
});

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://paid-app.com";
}

export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;
  const supabase = await createRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("bookkeeper_invites")
    .select(
      "id, bookkeeper_email, permissions, accepted_at, last_access_at, revoked_at, expires_at, created_at"
    )
    .eq("owner_user_id", ctx.user.id)
    .order("created_at", { ascending: false });
  if (error) return serverError(error.message);
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }
  const parsed = InviteSchema.safeParse(json);
  if (!parsed.success) return serverError("Invalid payload", 400);

  const supabase = await createRouteHandlerClient(request);
  const insert = {
    owner_user_id: ctx.user.id,
    bookkeeper_email: parsed.data.bookkeeper_email.trim().toLowerCase(),
    permissions: parsed.data.permissions ?? "send",
  };

  const { data: invite, error } = await supabase
    .from("bookkeeper_invites")
    .insert(insert)
    .select("id, token, bookkeeper_email, permissions, expires_at")
    .single();

  if (error || !invite) {
    return serverError(error?.message ?? "Could not create invite");
  }

  const link = `${appBase()}/bookkeeper/${invite.token}`;

  return NextResponse.json({
    invite: {
      id: invite.id,
      bookkeeper_email: invite.bookkeeper_email,
      permissions: invite.permissions,
      expires_at: invite.expires_at,
      link,
    },
  });
}

const RevokeSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }
  const parsed = RevokeSchema.safeParse(json);
  if (!parsed.success) return serverError("Invalid payload", 400);

  const supabase = await createRouteHandlerClient(request);
  const { error } = await supabase
    .from("bookkeeper_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("owner_user_id", ctx.user.id);

  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}

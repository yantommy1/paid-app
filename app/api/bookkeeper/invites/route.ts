import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { sendGmailMessage } from "@/lib/gmail/send";
import { ensureGmailToken } from "@/lib/oauth/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import type { GmailToken } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const InviteSchema = z.object({
  bookkeeper_email: z.string().email(),
  permissions: z.enum(["review", "send"]).optional(),
  send_email: z.boolean().optional(),
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

  // Optional: send the invite email from the owner's Gmail.
  if (parsed.data.send_email !== false) {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("gmail_token, email")
        .eq("id", ctx.user.id)
        .maybeSingle();
      const token = profile?.gmail_token as unknown as GmailToken | null;
      const fresh = await ensureGmailToken(token);
      if (fresh) {
        const admin = createAdminClient();
        await admin
          .from("users")
          .update({ gmail_token: fresh as unknown as Record<string, unknown> })
          .eq("id", ctx.user.id);

        await sendGmailMessage(
          fresh,
          parsed.data.bookkeeper_email,
          "I shared my overdue invoices with you in Paid",
          [
            "Hi,",
            "",
            "I started using Paid (paid-app.com) to follow up on overdue invoices for our firm.",
            "I shared my queue with you so you can review and approve the AI-drafted reminders before they go out.",
            "",
            `Open the queue here: ${link}`,
            "",
            "This link will expire in 60 days. Reply if anything looks off.",
            "",
            "Thanks",
          ].join("\n")
        );
      }
    } catch (e) {
      console.error("[bookkeeper/invites] failed to send invite email", e);
      // Non-fatal: the link is still returned to the owner UI.
    }
  }

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

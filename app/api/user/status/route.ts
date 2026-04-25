import { serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/** Live connection + onboarding flags for the signed-in user (avoids stale URL params). */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const { data: profile, error } = await supabase
    .from("users")
    .select("quickbooks_token, gmail_token, onboarding_completed")
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({
    quickbooksConnected: profile?.quickbooks_token != null,
    gmailConnected: profile?.gmail_token != null,
    onboardingCompleted: profile?.onboarding_completed === true,
  });
}

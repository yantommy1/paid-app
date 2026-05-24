import { featuresFor, getUserPlan } from "@/lib/billing/plan";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Returns the current user's plan + feature flags. Single source of truth
 * for "what is this user allowed to do?" — both the web app and the Gmail
 * Add-On read from here so the gating decisions never drift between
 * surfaces.
 *
 * Trial users come back as plan: 'pro' (intentional — see lib/billing/plan).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  const supabase = await createRouteHandlerClient(request);
  const plan = await getUserPlan(supabase, ctx.user.id);
  return NextResponse.json({
    plan,
    features: featuresFor(plan),
  });
}

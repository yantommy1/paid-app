import { serverError, unauthorized } from "@/lib/api/errors";
import { postLoginPathForState } from "@/lib/auth/post-login-path";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Mark onboarding finished — user is routed to /dashboard on future logins. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const { error } = await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (error) {
    return serverError(error.message);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  const nextPath = postLoginPathForState({
    onboardingCompleted: true,
    subscriptionStatus: (profile?.subscription_status as string | null) ?? null,
  });

  return NextResponse.json({ ok: true, nextPath });
}

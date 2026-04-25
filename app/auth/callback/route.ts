import { createClient } from "@/lib/supabase/server";
import { postLoginPathForState } from "@/lib/auth/post-login-path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed, subscription_status")
          .eq("id", user.id)
          .maybeSingle();

        return NextResponse.redirect(
          new URL(
            postLoginPathForState({
              onboardingCompleted: profile?.onboarding_completed === true,
              subscriptionStatus: (profile?.subscription_status as string | null) ?? null,
            }),
            request.url
          )
        );
      }
    }
  }

  return NextResponse.redirect(new URL("/?error=auth", request.url));
}

import { HomeLanding } from "@/components/landing/HomeLanding";
import { getPostLoginPath } from "@/lib/auth/post-login-path";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("onboarding_completed, subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    redirect(getPostLoginPath(profile));
  }

  return <HomeLanding />;
}

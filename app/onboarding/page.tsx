import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingClient } from "@/components/OnboardingClient";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <div className="mb-10 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paid-brand text-sm font-bold text-white">
          P
        </span>
        <span className="text-lg font-semibold">Paid setup</span>
      </div>
      <OnboardingClient
        initialStep={params.step}
        email={user.email ?? ""}
      />
    </main>
  );
}

import { createClient } from "@/lib/supabase/server";
import { DashboardHeaderActions } from "@/components/DashboardHeaderActions";
import { OverdueInvoicesPanel } from "@/components/OverdueInvoicesPanel";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && profile.onboarding_completed === false) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-paid-ink px-6 py-12 text-paid-mist">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-8">
          <div>
            <span className="font-display text-2xl tracking-tight">Paid</span>
            <p className="mt-1 text-sm text-paid-mist/50">
              Signed in as {user.email ?? ""}
            </p>
          </div>
          <DashboardHeaderActions />
        </header>

        <div>
          <h1 className="font-display text-3xl tracking-tight md:text-4xl">
            Receivables
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-paid-mist/60">
            Open balances from QuickBooks, grouped by how late they are. Draft a
            reminder when you&apos;re ready.
          </p>
        </div>

        <OverdueInvoicesPanel />
      </div>
    </main>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverdueInvoicesPanel } from "@/components/OverdueInvoicesPanel";
import { SyncInvoicesSection } from "@/components/SyncInvoicesSection";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paid-brand text-sm font-bold text-white">
            P
          </span>
          <span className="text-lg font-semibold">Dashboard</span>
        </div>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-paid-brand hover:underline"
        >
          Setup &amp; integrations
        </Link>
      </div>

      <p className="mb-8 text-sm text-slate-500">
        Signed in as {user.email ?? ""}
      </p>

      <SyncInvoicesSection />

      <OverdueInvoicesPanel />
    </main>
  );
}

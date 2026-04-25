import { OverdueInvoicesPanel } from "@/components/OverdueInvoicesPanel";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.onboarding_completed === false) {
    redirect("/onboarding");
  }

  async function signOutAction() {
    "use server";
    const serverSupabase = await createClient();
    await serverSupabase.auth.signOut();
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-[#F7F7F5]">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-6">
          <Link href="/" className="font-display text-4xl italic text-white">
            Paid
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#D8D8D8]">
            <span>{user.email}</span>
            <Link href="/settings" className="text-white hover:text-[#A3C0B4]">
              Settings
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded border border-white/30 px-4 py-2 text-white hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <section className="mb-8">
          <h1 className="font-display text-5xl text-white">Receivables</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#C7C7C7]">
            Open balances from QuickBooks, grouped by how late they are. Draft a reminder when
            you&apos;re ready.
          </p>
        </section>

        <OverdueInvoicesPanel />
      </div>
    </main>
  );
}

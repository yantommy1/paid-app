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
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E5E5] pb-6">
          <Link href="/" className="font-display text-4xl italic text-[#0D0D0D]">
            Paid
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#0D0D0D]">
            <span>{user.email}</span>
            <Link href="/settings" className="text-[#0D0D0D] hover:text-[#1B4332]">
              Settings
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded border border-[#E5E5E5] px-4 py-2 text-[#0D0D0D] hover:bg-[#F7F7F5]"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <section className="mb-8">
          <h1 className="font-display text-5xl text-[#0D0D0D]">Receivables</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#6B6B6B]">
            Open balances from QuickBooks, grouped by how late they are. Draft a reminder when
            you&apos;re ready.
          </p>
        </section>

        <OverdueInvoicesPanel />
      </div>
    </main>
  );
}

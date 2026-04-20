"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function DashboardHeaderActions() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4 sm:gap-6">
      <Link
        href="/settings"
        className="text-sm font-medium text-paid-mist/75 transition hover:text-[#00E5A0]"
      >
        Setup & integrations
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-sm font-medium text-paid-mist/75 transition hover:text-[#00E5A0]"
      >
        Sign out
      </button>
    </div>
  );
}

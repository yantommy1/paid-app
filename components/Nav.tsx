"use client";

import { createClient } from "@/lib/supabase/browser";
import { SmartLogoLink } from "@/components/SmartLogoLink";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type NavProps = {
  userEmail?: string | null;
  userDisplayName?: string | null;
};

function initialForEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim();
  return value.length > 0 ? value.charAt(0).toUpperCase() : "?";
}

export function Nav({ userEmail = null, userDisplayName = null }: NavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const initials = useMemo(() => initialForEmail(userEmail), [userEmail]);
  const loggedIn = !!userEmail;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  return (
    <nav className="border-b border-[#E5E5E5] bg-white">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-5">
        <SmartLogoLink loggedIn={loggedIn} className="font-display text-3xl text-[#0D0D0D]" />

        {!loggedIn ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/pricing?signin=1" className="text-[#0D0D0D] hover:text-[#1B4332]">
              Sign in
            </Link>
            <Link
              href="/pricing"
              className="rounded-md bg-[#1B4332] px-4 py-2 text-white hover:opacity-95"
            >
              Get started
            </Link>
          </div>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-3 text-sm text-[#0D0D0D]"
              aria-expanded={open}
              aria-haspopup="menu"
            >
              <span className="hidden max-w-[220px] truncate text-[#6B6B6B] sm:block">
                {userDisplayName || userEmail}
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E5E5] bg-white">
                {initials}
              </span>
            </button>
            {open && (
              <div
                className="absolute right-0 mt-2 w-44 border border-[#E5E5E5] bg-white py-2 shadow-md"
                role="menu"
              >
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-sm text-[#0D0D0D] hover:bg-[#F7F7F5]"
                  onClick={() => setOpen(false)}
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="block w-full px-4 py-2 text-left text-sm text-[#0D0D0D] hover:bg-[#F7F7F5] disabled:opacity-60"
                >
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

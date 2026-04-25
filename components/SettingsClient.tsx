"use client";

import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const GMAIL_ADDON_INSTALL_URL =
  "https://script.google.com/macros/s/AKfycbziHm_MsqZ3dRjMoDyKgHUYpkTATh7Bu4B7f82YD8l9/exec";

type Props = {
  email: string;
  quickbooksConnected: boolean;
  gmailConnected: boolean;
  quickbooksRealmId: string | null;
};

function StatusDot({ connected }: { connected: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[#1B4332]" : "bg-red-600"}`} aria-hidden />;
}

export function SettingsClient({ email, quickbooksConnected: qbInitial, gmailConnected: gmInitial, quickbooksRealmId }: Props) {
  const router = useRouter();
  const [qbConn, setQbConn] = useState(qbInitial);
  const [gmConn, setGmConn] = useState(gmInitial);
  const [qbBusy, setQbBusy] = useState(false);
  const [gmBusy, setGmBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  useEffect(() => {
    setQbConn(qbInitial);
    setGmConn(gmInitial);
  }, [qbInitial, gmInitial]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function disconnectQuickBooks() {
    setQbBusy(true);
    try {
      const res = await fetch("/api/auth/quickbooks", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect.");
      setQbConn(false);
      router.refresh();
    } finally {
      setQbBusy(false);
    }
  }

  async function disconnectGmail() {
    setGmBusy(true);
    try {
      const res = await fetch("/api/auth/gmail", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect.");
      setGmConn(false);
      router.refresh();
    } finally {
      setGmBusy(false);
    }
  }

  async function generateConnectionKey() {
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      const res = await fetch("/api/auth/api-key", { method: "POST" });
      const j = (await res.json()) as { api_key?: string; error?: string };
      if (!res.ok || !j.api_key) {
        setKeyMessage(j.error ?? "Could not generate a key. Try again.");
        return;
      }
      try {
        await navigator.clipboard.writeText(j.api_key);
      } catch {
        setKeyMessage("Key created but could not copy automatically.");
        return;
      }
      setKeyMessage("Key copied to clipboard — paste it into the Paid sidebar in Gmail");
    } catch {
      setKeyMessage("Something went wrong. Try again.");
    } finally {
      setKeyBusy(false);
    }
  }

  const cardClass = "border border-[#E5E5E5] bg-white p-6";

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 border-b border-[#E5E5E5] pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-4">
          <Link href="/" className="font-display text-3xl">Paid</Link>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-[#6B6B6B]">← Back to dashboard</Link>
          <p className="text-sm text-[#6B6B6B]">Signed in as {email}</p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Integrations</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className={cardClass}>
            <h3 className="font-display text-2xl">QuickBooks</h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#6B6B6B]"><StatusDot connected={qbConn} />{qbConn ? "Connected" : "Disconnected"}</p>
            {qbConn && quickbooksRealmId && <p className="mt-3 text-xs text-[#6B6B6B]">Company realm: {quickbooksRealmId}</p>}
            <div className="mt-6">
              {qbConn ? (
                <button type="button" disabled={qbBusy} onClick={() => void disconnectQuickBooks()} className="border border-black px-4 py-2 text-sm">{qbBusy ? "Disconnecting..." : "Disconnect"}</button>
              ) : (
                <a href="/api/auth/quickbooks?return_to=/settings" className="bg-black px-4 py-2 text-sm text-white">Connect QuickBooks</a>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="font-display text-2xl">Gmail</h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#6B6B6B]"><StatusDot connected={gmConn} />{gmConn ? "Connected" : "Disconnected"}</p>
            <div className="mt-6">
              {gmConn ? (
                <button type="button" disabled={gmBusy} onClick={() => void disconnectGmail()} className="border border-black px-4 py-2 text-sm">{gmBusy ? "Disconnecting..." : "Disconnect"}</button>
              ) : (
                <a href="/api/auth/gmail?return_to=/settings" className="bg-black px-4 py-2 text-sm text-white">Connect Gmail</a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <h3 className="font-display text-2xl">Gmail Add-On</h3>
        <a href={GMAIL_ADDON_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex bg-[#1B4332] px-5 py-3 text-sm font-medium text-white">
          Install Gmail Add-On
        </a>
        <p className="mt-2 text-xs text-[#6B6B6B]">Beta version — full Marketplace listing coming soon.</p>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-[#6B6B6B]">
          <li>Click Install Gmail Add-On above</li>
          <li>Open Gmail — look for the Paid icon in the right sidebar</li>
          <li>Enter https://paid-app.com as the API base and paste your connection key below</li>
        </ol>
        <button type="button" disabled={keyBusy} onClick={() => void generateConnectionKey()} className="mt-6 border border-black px-4 py-2.5 text-sm">
          {keyBusy ? "Generating..." : "Generate connection key"}
        </button>
        {keyMessage && <p className={`mt-4 text-sm ${keyMessage.startsWith("Key copied") ? "text-[#1B4332]" : "text-red-600"}`}>{keyMessage}</p>}
      </section>

      <div className="border-t border-[#E5E5E5] pt-10">
        <button type="button" onClick={() => void signOut()} className="border border-black px-5 py-2.5 text-sm">Sign out</button>
      </div>
    </div>
  );
}

"use client";

import { BillingSection } from "@/components/settings/BillingSection";
import { ReminderPreferencesSection } from "@/components/settings/ReminderPreferencesSection";
import { BookkeeperShareSection } from "@/components/settings/BookkeeperShareSection";
import { PaymentsSection } from "@/components/settings/PaymentsSection";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const GMAIL_ADDON_INSTALL_URL =
  "https://script.google.com/macros/s/AKfycbziHm_MsqZ3dRjMoDyKgHUYpkTATh7Bu4B7f82YD8l9/exec";

type Props = {
  displayName: string;
  userEmail: string;
  quickbooksConnected: boolean;
  gmailConnected: boolean;
  quickbooksRealmId: string | null;
  planName: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
};

function StatusDot({ connected }: { connected: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[#1B4332]" : "bg-red-600"}`} aria-hidden />;
}

export function SettingsClient({
  displayName,
  userEmail,
  quickbooksConnected: qbInitial,
  gmailConnected: gmInitial,
  quickbooksRealmId,
  planName,
  subscriptionStatus,
  trialEndsAt,
  subscriptionEndsAt,
}: Props) {
  const router = useRouter();
  const [qbConn, setQbConn] = useState(qbInitial);
  const [gmConn, setGmConn] = useState(gmInitial);
  const [qbBusy, setQbBusy] = useState(false);
  const [gmBusy, setGmBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyCreatedAt, setApiKeyCreatedAt] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    setQbConn(qbInitial);
    setGmConn(gmInitial);
  }, [qbInitial, gmInitial]);

  useEffect(() => {
    void loadApiKey();
  }, []);

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
      setApiKey(j.api_key);
      setApiKeyCreatedAt(new Date().toISOString());
      setShowKey(true);
      setKeyMessage("New key generated. Update it in your Gmail Add-On settings.");
    } catch {
      setKeyMessage("Something went wrong. Try again.");
    } finally {
      setKeyBusy(false);
    }
  }

  async function loadApiKey() {
    try {
      const res = await fetch("/api/auth/api-key", { method: "GET" });
      const j = (await res.json()) as { api_key?: string | null; created_at?: string | null };
      if (!res.ok) return;
      setApiKey(j.api_key ?? null);
      setApiKeyCreatedAt(j.created_at ?? null);
    } catch {
      // no-op; keep UI usable even if this fails
    }
  }

  async function testConnection() {
    setHealthBusy(true);
    setHealthOk(null);
    try {
      const res = await fetch("/api/health", { method: "GET" });
      setHealthOk(res.ok);
    } catch {
      setHealthOk(false);
    } finally {
      setHealthBusy(false);
    }
  }

  function maskedKey(value: string | null): string {
    if (!value) return "No key generated yet";
    if (showKey) return value;
    if (value.length <= 10) return "••••••••";
    return `${value.slice(0, 6)}••••••••${value.slice(-4)}`;
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  const cardClass = "border border-[#E5E5E5] bg-white p-6";

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 border-b border-[#E5E5E5] pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-[#6B6B6B]">← Back to dashboard</Link>
          <p className="text-sm text-[#6B6B6B]">Signed in as {displayName}</p>
        </div>
      </header>

      <BillingSection
        planName={planName}
        subscriptionStatus={subscriptionStatus}
        trialEndsAt={trialEndsAt}
        subscriptionEndsAt={subscriptionEndsAt}
      />

      <ReminderPreferencesSection />

      <PaymentsSection />

      <BookkeeperShareSection />

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Integrations</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className={cardClass}>
            <h3 className="font-display text-2xl">QuickBooks</h3>
            <p className={`mt-2 flex items-center gap-2 text-sm ${qbConn ? "text-[#1B4332]" : "text-[#6B6B6B]"}`}><StatusDot connected={qbConn} />{qbConn ? "Connected" : "Disconnected"}</p>
            {qbConn && quickbooksRealmId && <p className="mt-3 text-xs text-[#6B6B6B]">Company realm: {quickbooksRealmId}</p>}
            <div className="mt-6">
              {qbConn ? (
                <button type="button" disabled={qbBusy} onClick={() => void disconnectQuickBooks()} className="border border-red-600 bg-white px-4 py-2 text-sm text-red-600">{qbBusy ? "Disconnecting..." : "Disconnect"}</button>
              ) : (
                <a href="/api/auth/quickbooks?return_to=/settings" className="bg-[#1B4332] px-4 py-2 text-sm text-white">Connect QuickBooks</a>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="font-display text-2xl">Gmail</h3>
            <p className={`mt-2 flex items-center gap-2 text-sm ${gmConn ? "text-[#1B4332]" : "text-[#6B6B6B]"}`}><StatusDot connected={gmConn} />{gmConn ? "Connected" : "Disconnected"}</p>
            <div className="mt-6">
              {gmConn ? (
                <button type="button" disabled={gmBusy} onClick={() => void disconnectGmail()} className="border border-red-600 bg-white px-4 py-2 text-sm text-red-600">{gmBusy ? "Disconnecting..." : "Disconnect"}</button>
              ) : (
                <a href="/api/auth/gmail?return_to=/settings" className="bg-[#1B4332] px-4 py-2 text-sm text-white">Connect Gmail</a>
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
        <div className="mt-6 space-y-4 border border-[#E5E5E5] bg-[#FAFAFA] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#6B6B6B]">Connection key</p>
          <div className="rounded border border-[#D8D8D8] bg-white px-3 py-2 font-mono text-xs break-all">
            {maskedKey(apiKey)}
          </div>
          <div className="flex flex-wrap gap-3">
              <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
                className="border border-[#1B4332] px-3 py-2 text-xs text-[#1B4332]"
            >
              {showKey ? "Hide key" : "Show key"}
            </button>
              <button
              type="button"
              disabled={!apiKey}
              onClick={() => apiKey && navigator.clipboard.writeText(apiKey)}
                className="border border-[#1B4332] px-3 py-2 text-xs text-[#1B4332] disabled:opacity-50"
            >
              Copy key
            </button>
            <button
              type="button"
              disabled={keyBusy}
              onClick={() => void generateConnectionKey()}
              className="bg-[#1B4332] px-3 py-2 text-xs text-white"
            >
              {keyBusy ? "Generating..." : apiKey ? "Regenerate key" : "Generate key"}
            </button>
          </div>
          <p className="text-xs text-[#6B6B6B]">Generated: {formatTime(apiKeyCreatedAt)}</p>
          <div className="flex items-center gap-3">
              <button
              type="button"
              disabled={healthBusy}
              onClick={() => void testConnection()}
                className="border border-[#1B4332] px-3 py-2 text-xs text-[#1B4332]"
            >
              {healthBusy ? "Testing..." : "Test connection"}
            </button>
            {healthOk === true && <span className="text-xs text-[#1B4332]">✓ Paid servers reachable</span>}
            {healthOk === false && <span className="text-xs text-red-600">Connection failed</span>}
          </div>
        </div>
        {keyMessage && (
          <p className={`mt-4 text-sm ${keyMessage.includes("generated") ? "text-[#1B4332]" : "text-red-600"}`}>
            {keyMessage}
          </p>
        )}
      </section>

      <DeleteAccountSection
        userEmail={userEmail}
        onDeleted={async () => {
          // Sign the user out cleanly so the (now-invalid) cookie doesn't
          // linger and trigger 401 loops on the next page load.
          try {
            await createClient().auth.signOut();
          } catch {
            // Ignore — the auth user is already gone server-side.
          }
          router.push("/");
          router.refresh();
        }}
      />
    </div>
  );
}

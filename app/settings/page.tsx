import { SettingsClient } from "@/components/SettingsClient";
import { createClient } from "@/lib/supabase/server";
import type { QuickBooksToken } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("quickbooks_token, gmail_token, email")
    .eq("id", user.id)
    .maybeSingle();

  const qbToken = profile?.quickbooks_token as unknown as QuickBooksToken | null;
  const realmId =
    qbToken && typeof qbToken === "object" && "realm_id" in qbToken
      ? String(qbToken.realm_id ?? "")
      : "";
  const quickbooksRealmId = realmId.length > 0 ? realmId : null;

  return (
    <main className="min-h-screen bg-paid-ink px-6 py-12 text-paid-mist">
      <div className="mx-auto max-w-5xl">
        <SettingsClient
          email={user.email ?? profile?.email ?? ""}
          quickbooksConnected={profile?.quickbooks_token != null}
          gmailConnected={profile?.gmail_token != null}
          quickbooksRealmId={quickbooksRealmId}
        />
      </div>
    </main>
  );
}

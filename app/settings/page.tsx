import { SettingsClient } from "@/components/SettingsClient";
import { planNameFromStripePriceId } from "@/lib/billing/plan-name";
import { createClient } from "@/lib/supabase/server";
import type { QuickBooksToken } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select(
      "quickbooks_token, gmail_token, email, stripe_price_id, subscription_status, trial_ends_at, subscription_ends_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  const qbToken = profile?.quickbooks_token as unknown as QuickBooksToken | null;
  const realmId =
    qbToken && typeof qbToken === "object" && "realm_id" in qbToken
      ? String(qbToken.realm_id ?? "")
      : "";

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-[#0D0D0D]">
      <div className="mx-auto max-w-[1200px]">
        <SettingsClient
          email={user.email ?? profile?.email ?? ""}
          quickbooksConnected={profile?.quickbooks_token != null}
          gmailConnected={profile?.gmail_token != null}
          quickbooksRealmId={realmId.length > 0 ? realmId : null}
          planName={planNameFromStripePriceId(profile?.stripe_price_id as string | null | undefined)}
          subscriptionStatus={(profile?.subscription_status as string | null) ?? null}
          trialEndsAt={(profile?.trial_ends_at as string | null) ?? null}
          subscriptionEndsAt={(profile?.subscription_ends_at as string | null) ?? null}
        />
      </div>
    </main>
  );
}

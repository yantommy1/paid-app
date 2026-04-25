import { PricingPageClient } from "@/components/pricing/PricingPageClient";
import { createClient } from "@/lib/supabase/server";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; message?: string; email?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = await searchParams;
  const showCanceled =
    sp.canceled === "1" || sp.message === "canceled" || sp.message === "canceled-subscription";
  const initialEmail = typeof sp.email === "string" ? sp.email.trim() : "";

  return (
    <div className="min-h-screen bg-white">
      <PricingPageClient
        loggedIn={!!user}
        starterPriceId={process.env.STRIPE_STARTER_PRICE_ID?.trim() ?? ""}
        proPriceId={process.env.STRIPE_PRO_PRICE_ID?.trim() ?? ""}
        initialEmail={initialEmail}
        showCanceled={showCanceled}
      />
    </div>
  );
}

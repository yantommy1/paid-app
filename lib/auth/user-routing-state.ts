export type UserRoutingState = {
  onboardingCompleted: boolean;
  subscriptionStatus: string | null;
};

function normalizeSubscriptionStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function postLoginPathForState(state: UserRoutingState): string {
  if (!state.onboardingCompleted) return "/onboarding";
  if (state.subscriptionStatus === "trialing" || state.subscriptionStatus === "active") {
    return "/dashboard";
  }
  return "/pricing";
}

/**
 * Reads routing-relevant profile fields while gracefully handling missing rows/columns.
 * Missing user row or missing subscription_status is treated as null subscription.
 */
export async function getUserRoutingState(
  supabase: {
    from: (table: string) => {
      select: (query: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: any; error: { message?: string } | null }>;
        };
      };
    };
  },
  userId: string
): Promise<UserRoutingState> {
  const primary = await supabase
    .from("users")
    .select("onboarding_completed, subscription_status")
    .eq("id", userId)
    .maybeSingle();

  if (!primary.error) {
    if (!primary.data) {
      return { onboardingCompleted: true, subscriptionStatus: null };
    }
    return {
      onboardingCompleted: primary.data.onboarding_completed === true,
      subscriptionStatus: normalizeSubscriptionStatus(primary.data.subscription_status),
    };
  }

  const msg = (primary.error.message ?? "").toLowerCase();
  const missingSubscriptionColumn =
    msg.includes("subscription_status") && (msg.includes("column") || msg.includes("schema"));

  if (!missingSubscriptionColumn) {
    return { onboardingCompleted: true, subscriptionStatus: null };
  }

  const fallback = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (!fallback.error && fallback.data) {
    return {
      onboardingCompleted: fallback.data.onboarding_completed === true,
      subscriptionStatus: null,
    };
  }

  return { onboardingCompleted: true, subscriptionStatus: null };
}

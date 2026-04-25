export type UserGateProfile = {
  onboarding_completed?: boolean | null;
  subscription_status?: string | null;
} | null;

/** Where to send a logged-in user instead of the marketing home page. */
export function getPostLoginPath(profile: UserGateProfile): string {
  if (profile?.onboarding_completed !== true) return "/onboarding";
  const status = profile.subscription_status ?? null;
  if (status === "trialing" || status === "active") return "/dashboard";
  return "/pricing";
}

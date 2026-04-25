type UserRoutingState = {
  onboardingCompleted: boolean;
  subscriptionStatus: string | null;
};

export function postLoginPathForState(state: UserRoutingState): string {
  if (!state.onboardingCompleted) {
    return "/onboarding";
  }

  const status = state.subscriptionStatus;
  if (status === "trialing" || status === "active") {
    return "/dashboard";
  }

  return "/pricing";
}

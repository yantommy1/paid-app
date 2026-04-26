export const PENDING_PLAN_STORAGE_KEY = "paid.pendingPlan";

export type PendingPlan = {
  plan: "starter" | "pro";
  priceId: string;
};

export function savePendingPlan(plan: PendingPlan): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_PLAN_STORAGE_KEY, JSON.stringify(plan));
}

export function getPendingPlan(): PendingPlan | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_PLAN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPlan>;
    if (
      (parsed.plan === "starter" || parsed.plan === "pro") &&
      typeof parsed.priceId === "string" &&
      parsed.priceId.trim().length > 0
    ) {
      return { plan: parsed.plan, priceId: parsed.priceId.trim() };
    }
  } catch {
    return null;
  }
  return null;
}

export function clearPendingPlan(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_PLAN_STORAGE_KEY);
}

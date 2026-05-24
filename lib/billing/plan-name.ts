export function planNameFromStripePriceId(priceId: string | null | undefined): string {
  if (!priceId) return "—";
  const starter = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const pro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (starter && priceId === starter) return "Starter";
  if (pro && priceId === pro) return "Pro";
  return "Paid";
}

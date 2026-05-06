import { getUserDisplayName } from "@/lib/auth/display-name";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { resolvePaymentLink } from "@/lib/payments/pay-link";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  installments: z.number().int().min(2).max(12).optional(),
});

/**
 * Build a "payment plan offer" email template the merchant can send when a
 * client says they can't pay in full. Drops a per-installment breakdown +
 * the existing /pay/[id]/plan link so the client can take action.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUserFromRequest(request);
  if (ctx.response) return ctx.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return serverError("Invalid JSON", 400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return serverError("Invalid payload", 400);

  const supabase = await createRouteHandlerClient(request);
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, client_name, client_email, amount, days_overdue, quickbooks_invoice_id"
    )
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (!inv) return notFound("Invoice not found");

  const { data: settings } = await supabase
    .from("settings")
    .select("payment_plan_installments")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  const installments =
    parsed.data.installments ??
    Number(settings?.payment_plan_installments ?? 3);

  const total = Number(inv.amount);
  const monthly = Math.ceil((total / installments) * 100) / 100;

  const senderName = getUserDisplayName(ctx.user);
  const clientFirst = (inv.client_name || "there").trim().split(/\s+/)[0] || "there";

  // Reuse the public /pay/[id]/plan URL.
  const paymentLink = await resolvePaymentLink(supabase, ctx.user.id, inv.id, {
    planEnabled: true,
  });
  const planUrl = paymentLink?.paymentPlanUrl ?? null;

  const subject = `Payment plan for invoice ${inv.quickbooks_invoice_id}`;
  const lines: string[] = [];
  lines.push(`Hi ${clientFirst},`);
  lines.push("");
  lines.push(
    `Thanks for letting me know. Happy to set up a payment plan on invoice ${inv.quickbooks_invoice_id} ($${total.toFixed(
      2
    )}). Here is a simple structure that usually works:`
  );
  lines.push("");
  lines.push(
    `${installments} monthly installments of approximately $${monthly.toFixed(2)}, starting this month.`
  );
  lines.push("");
  if (planUrl) {
    lines.push(
      `If that works, you can confirm and start the first installment here: ${planUrl}`
    );
  } else {
    lines.push(
      "If that works, reply to confirm and I'll send the first invoice for the installment amount."
    );
  }
  lines.push("");
  lines.push("Open to adjusting the schedule if a different cadence is easier — just let me know.");
  lines.push("");
  lines.push("Thanks,");
  lines.push("");
  lines.push(senderName);

  return NextResponse.json({
    subject,
    body: lines.join("\n"),
    to: inv.client_email,
    installments,
    monthly,
    total,
  });
}

import { draftReminderEmail } from "@/lib/anthropic/draft";
import { notFound, serverError } from "@/lib/api/errors";
import { requireUserFromRequest } from "@/lib/api/require-user-request";
import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
});

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
  if (!parsed.success) {
    return serverError("Invalid payload", 400);
  }

  const supabase = await createRouteHandlerClient(request);
  const { data: inv, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .eq("user_id", ctx.user.id)
    .single();

  if (error || !inv) {
    return notFound("Invoice not found");
  }

  const ownerName = ctx.user.email?.split("@")[0] ?? "there";

  try {
    const draft = await draftReminderEmail(
      {
        client_name: inv.client_name,
        amount: inv.amount,
        days_overdue: inv.days_overdue,
        due_date: inv.due_date,
        quickbooks_invoice_id: inv.quickbooks_invoice_id,
        line_items: inv.line_items ?? null,
        memo: inv.memo ?? null,
      },
      ownerName
    );
    return NextResponse.json({ subject: draft.subject, body: draft.body });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft failed";
    return serverError(message);
  }
}

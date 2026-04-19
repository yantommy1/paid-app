import Anthropic from "@anthropic-ai/sdk";
import type { InvoiceRow } from "@/lib/types";

/** Override with ANTHROPIC_MODEL in .env if your account uses a different ID. */
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to .env.local and restart the dev server."
    );
  }
  return new Anthropic({ apiKey: key });
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export async function draftReminderEmail(
  invoice: Pick<
    InvoiceRow,
    | "client_name"
    | "amount"
    | "days_overdue"
    | "due_date"
    | "quickbooks_invoice_id"
  >,
  ownerName: string
): Promise<{ subject: string; body: string }> {
  const client = getAnthropicClient();
  const model = getModel();
  const tier =
    invoice.days_overdue >= 90
      ? "90+ days: serious, urgent, still respectful — owner personally needs this resolved."
      : invoice.days_overdue >= 60
        ? "60+ days: firm, professional, clear consequences without threats."
        : "30+ days: friendly, casual, assume good intent — a gentle nudge from the owner.";

  const prompt = `You are helping ${ownerName} write a short payment reminder for their small professional services business.

Invoice reference: ${invoice.quickbooks_invoice_id}
Client: ${invoice.client_name}
Amount due: $${Number(invoice.amount).toFixed(2)}
Due date: ${invoice.due_date}
Days overdue: ${invoice.days_overdue}

Tone guidance: ${tier}

Requirements:
- Sound like ${ownerName} wrote it personally — warm human voice, not marketing or automated.
- No legalese unless tier is 90+ (then brief and factual).
- 2–4 short paragraphs max.
- Include a clear ask to pay or reply with questions.
- Subject line: one line, specific, not spammy.

Respond with JSON only, shape: {"subject":"...","body":"..."}`;

  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic returned no text");
  }
  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from Anthropic");
  const parsed = JSON.parse(jsonMatch[0]) as { subject: string; body: string };
  if (!parsed.subject || !parsed.body) {
    throw new Error("Invalid draft shape from Anthropic");
  }
  return { subject: parsed.subject, body: parsed.body };
}

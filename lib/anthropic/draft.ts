import Anthropic from "@anthropic-ai/sdk";
import type { InvoiceRow } from "@/lib/types";
import { type Tone, toneGuidanceCopy } from "@/lib/tone/compute";

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

export type DraftOptions = {
  tone?: Tone;
  /** Optional copy appended verbatim after the AI body, e.g. "Pay this invoice online: <link>" */
  paymentLineHint?: string;
  /** Optional one-line offer to include in the body, e.g. "2% discount if paid within 7 days" */
  earlyPayOfferLine?: string;
};

export async function draftReminderEmail(
  invoice: Pick<
    InvoiceRow,
    | "client_name"
    | "amount"
    | "days_overdue"
    | "due_date"
    | "quickbooks_invoice_id"
    | "line_items"
    | "memo"
  >,
  senderName: string,
  clientName: string,
  options: DraftOptions = {}
): Promise<{ subject: string; body: string; tone: Tone }> {
  const client = getAnthropicClient();
  const model = getModel();
  const tone: Tone = options.tone ?? "professional";
  const toneGuidance = toneGuidanceCopy(tone, invoice.days_overdue);

  const memoBlock =
    invoice.memo?.trim() ?
      `Invoice memo (shown to customer in QuickBooks): ${invoice.memo.trim()}`
    : "Invoice memo: (none)";

  const linesBlock =
    invoice.line_items?.trim() ?
      `Work / line items (from QuickBooks invoice lines — reference this so the email reflects actual services or products, not only the total):\n${invoice.line_items.trim()}`
    : "Line items: (not itemized on this invoice — refer to amount and invoice reference only).";

  const clientFirstName =
    (clientName || invoice.client_name || "")
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-zA-Z'-]/g, "") || "there";

  const earlyPayInstruction = options.earlyPayOfferLine
    ? `Mention this offer naturally in the body (do not just paste the phrase verbatim): "${options.earlyPayOfferLine}".`
    : "Do not invent any discount or payment plan offer.";

  const prompt = `You are helping ${senderName} write a short payment reminder for their professional services business (engineering, architecture, or similar).

Invoice reference: ${invoice.quickbooks_invoice_id}
Client: ${invoice.client_name}
Amount due: $${Number(invoice.amount).toFixed(2)}
Due date: ${invoice.due_date}
Days overdue: ${invoice.days_overdue}

${memoBlock}

${linesBlock}

Tone: ${tone}
Tone guidance: ${toneGuidance}

Requirements:
- Use this exact greeting format at the top: "Hi ${clientFirstName},"
- Sound like ${senderName} wrote it personally — warm human voice, not marketing or automated. Avoid corporate filler.
- Where line items or memo describe specific work, naturally mention that substance (what was done or sold), not only the invoice number and dollar amount.
- ${earlyPayInstruction}
- No legalese unless tone is firm and days overdue >= 90 (then brief and factual, never threatening).
- 2 to 4 short paragraphs max.
- Include a clear ask to pay or reply with questions.
- Do NOT include a payment link or Pay Now URL — that is appended automatically below your sign-off.
- Subject line: one line, specific to this invoice and client, not spammy.
- Sign the email with the sender's name: ${senderName}. Do not use their email address.
- End the body with the following closing exactly:
  [blank line]
  Thanks,
  [blank line]
  ${senderName}

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

  let body = parsed.body;
  if (options.paymentLineHint) {
    body = `${body.trimEnd()}\n\n${options.paymentLineHint}`;
  }

  return { subject: parsed.subject, body, tone };
}

import Anthropic from "@anthropic-ai/sdk";

// claude-3-5-haiku-20241022 was retired by Anthropic — calls now return
// 404 not_found_error. claude-haiku-4-5-20251001 is the current Haiku.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

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
  return process.env.ANTHROPIC_REPLY_MODEL?.trim() || DEFAULT_MODEL;
}

export type ReplyClassification =
  | "will_pay_later"
  | "cannot_pay"
  | "invoice_issue"
  | "payment_plan_request"
  | "paid_already"
  | "unrelated"
  | "unknown";

export type ClassifiedReply = {
  classification: ReplyClassification;
  /** ISO date (YYYY-MM-DD) the client promised to pay, if extractable. */
  promisedPayDate: string | null;
  /** Short excerpt the model used (for transparency in the UI). */
  excerpt: string | null;
  /** A one-line suggested action shown to the owner. */
  suggestedAction: string;
  rawModelOutput: string;
};

const SYSTEM_PROMPT = `You classify a single client reply to a payment-reminder email into one of these categories:

- will_pay_later: Client acknowledges the invoice and gives a future date or rough timeframe ("paying Friday", "next week", "end of the month"). Extract the promised date if possible (today is provided in the user prompt).
- cannot_pay: Client says they cannot pay right now, are short on cash, or asks for forbearance, but does not explicitly request a payment plan.
- payment_plan_request: Client explicitly asks to split into installments or a payment plan.
- invoice_issue: Client disputes the invoice, asks for a corrected one, says the work was not delivered, claims they were billed twice, or otherwise raises a question about the invoice itself.
- paid_already: Client claims they already paid (and may include a check number, transfer date, etc.).
- unrelated: The reply is unrelated to the invoice (out-of-office, wrong person, generic chatter).
- unknown: Cannot determine.

Output STRICT JSON with shape:
{"classification":"...","promised_pay_date":"YYYY-MM-DD or null","excerpt":"<= 200 chars from the reply that justifies the call","suggested_action":"one short sentence the merchant can do next"}

Use null (not the string "null") for missing fields. Today's date is given in the user message — use it to interpret relative dates.`;

export async function classifyReply(input: {
  todayISO: string;
  clientReplyText: string;
  invoiceContext?: { amount: number; daysOverdue: number; quickbooksInvoiceId: string } | null;
}): Promise<ClassifiedReply> {
  const client = getAnthropicClient();
  const model = getModel();

  const ctxLine = input.invoiceContext
    ? `Invoice context: ${input.invoiceContext.quickbooksInvoiceId}, $${input.invoiceContext.amount.toFixed(
        2
      )}, ${input.invoiceContext.daysOverdue} days overdue.`
    : "Invoice context: not provided.";

  const userPrompt = `Today: ${input.todayISO}
${ctxLine}

Client reply (verbatim):
"""
${input.clientReplyText.slice(0, 4000)}
"""

Classify and respond with JSON only.`;

  const res = await client.messages.create({
    model,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

  const fallback: ClassifiedReply = {
    classification: "unknown",
    promisedPayDate: null,
    excerpt: null,
    suggestedAction: "Open the thread and decide manually.",
    rawModelOutput: raw,
  };

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      classification?: string;
      promised_pay_date?: string | null;
      excerpt?: string | null;
      suggested_action?: string;
    };
    const classification =
      ([
        "will_pay_later",
        "cannot_pay",
        "invoice_issue",
        "payment_plan_request",
        "paid_already",
        "unrelated",
        "unknown",
      ] as ReplyClassification[]).find((c) => c === parsed.classification) ?? "unknown";

    return {
      classification,
      promisedPayDate:
        typeof parsed.promised_pay_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.promised_pay_date)
          ? parsed.promised_pay_date
          : null,
      excerpt:
        typeof parsed.excerpt === "string" && parsed.excerpt.trim().length > 0
          ? parsed.excerpt.trim().slice(0, 240)
          : null,
      suggestedAction:
        typeof parsed.suggested_action === "string" && parsed.suggested_action.trim().length > 0
          ? parsed.suggested_action.trim()
          : fallback.suggestedAction,
      rawModelOutput: raw,
    };
  } catch {
    return fallback;
  }
}

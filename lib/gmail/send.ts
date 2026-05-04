/**
 * Paid does NOT send email programmatically — that would require the
 * restricted `gmail.send` scope and a CASA Tier 2 security assessment.
 *
 * Instead, Paid drafts the reminder server-side and the merchant opens
 * Gmail's compose UI prefilled with the draft. The user clicks Send in
 * Gmail. This keeps Paid out of restricted-scope territory.
 */

const GMAIL_COMPOSE_BASE = "https://mail.google.com/mail/?view=cm&fs=1";
const URL_BUDGET = 1900;

export type GmailComposeArgs = {
  to: string;
  subject: string;
  bodyText: string;
};

export type GmailComposeResult = {
  url: string;
  bodyTruncated: boolean;
};

export function buildGmailComposeUrl(args: GmailComposeArgs): GmailComposeResult {
  const params = new URLSearchParams();
  params.set("to", args.to);
  params.set("su", args.subject);
  params.set("body", args.bodyText);

  let url = `${GMAIL_COMPOSE_BASE}&${params.toString()}`;
  let bodyTruncated = false;

  if (url.length <= URL_BUDGET) {
    return { url, bodyTruncated };
  }

  const overflow = url.length - URL_BUDGET;
  const safeBody =
    args.bodyText.length > overflow + 80
      ? `${args.bodyText.slice(0, args.bodyText.length - overflow - 80).trimEnd()}\n\n[Open this draft in your Gmail Drafts folder to see the full message.]`
      : args.bodyText;
  bodyTruncated = safeBody !== args.bodyText;

  const trimmed = new URLSearchParams();
  trimmed.set("to", args.to);
  trimmed.set("su", args.subject);
  trimmed.set("body", safeBody);
  url = `${GMAIL_COMPOSE_BASE}&${trimmed.toString()}`;

  return { url, bodyTruncated };
}

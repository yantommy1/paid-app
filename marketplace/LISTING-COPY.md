# Workspace Marketplace listing copy

Paste these strings into Google Cloud Console → APIs & Services →
**Google Workspace Marketplace SDK** → App Configuration / Store Listing.

---

## Identity

| Field | Value |
|------|-------|
| Application name | **Paid — AI invoice collections** |
| Short description (max 80 chars) | Turn your inbox into your collections team. AI reminders for QuickBooks. |
| Category | Productivity |
| Tagline (used on the listing tile) | Get paid for the work you already did. |

## Detailed description (max 4000 chars — currently ~1900)

> Paid is the fastest way for engineering, architecture, and other
> professional services firms to collect overdue invoices — without
> hiring an A/R clerk and without leaving Gmail.
>
> Connect QuickBooks once, and Paid pulls every open invoice into your
> Gmail sidebar. Click a customer's email and you instantly see what they
> owe and how late it is. Paid drafts a follow-up reminder in your voice,
> calibrated to invoice size and the customer's payment history. You
> approve with one click. Nothing ever auto-sends.
>
> Built by a real estate developer who watched too many of his engineers
> wait 90 days to send a reminder. Built for the firms developers, GCs,
> and owners hire.
>
> What Paid does:
> · Syncs every unpaid invoice from QuickBooks, with line items and memos
> · Drafts AI reminders that sound like you wrote them, not a CRM
> · Slides tone from friendly to firm based on client history and amount
> · Adds a Pay Now button (Stripe) to every email — with optional early-pay
>   discount and payment plan
> · Reads client replies on your click and classifies them: "will pay later"
>   schedules a follow-up; "invoice issue" flags it for you; "can't pay"
>   suggests a payment plan template
> · Shows a live ROI dashboard: how much Paid has recovered, average days
>   to payment, drafts waiting for approval
> · Lets you share the queue with your bookkeeper via a magic link, with
>   review-only or review-and-approve permissions
>
> What Paid never does:
> · Auto-send any email. Every reminder waits for your one-click approval.
> · Read your inbox in the background. Message bodies are read only when
>   you explicitly click "Classify reply" on an open thread.
> · Use your data to train AI models or serve advertising.
>
> Setup: 4 minutes. Pricing: starts at $49/month. 30-day free trial.

## Detailed description — short variant (if the field has a tighter limit)

> AI invoice collections for engineering, architecture, and professional
> services firms. Paid drafts a personalized reminder for every overdue
> QuickBooks invoice and queues it in your Gmail for one-click approval.
> Pay Now button on every email. Reply classification on demand. Built
> for the firms developers, GCs, and owners hire. 30-day free trial.

## Visual assets — shot list

Required:

- **App icon** — 128×128 PNG with transparent background. Save at
  `public/marketplace/icon-128.png` (referenced from `appsscript.json`).
- **Banner / "small tile"** — 220×140 PNG. Save at
  `public/marketplace/tile-220x140.png`.
- **Large tile** — 440×280 PNG. Save at
  `public/marketplace/tile-440x280.png`.
- **Hero / "promo image"** — 1400×560 PNG. Save at
  `public/marketplace/hero-1400x560.png`.

Screenshots (1280×800 PNG each, 5 max):

1. **Gmail sidebar showing overdue invoices grouped by aging bucket.**
   Caption: *"Every unpaid invoice in your Gmail sidebar."*
2. **Draft preview card** with subject + body + tone label + Pay Now line.
   Caption: *"AI reminders in your voice. You approve. We never auto-send."*
3. **Classify reply result card** showing classification + scheduled
   follow-up.
   Caption: *"We read replies on your click. 'Will pay next week' schedules
   the follow-up automatically."*
4. **Dashboard ROI hero** — "We've recovered $X for you" with the four
   tiles.
   Caption: *"See exactly what Paid has collected for you, in real time."*
5. **Bookkeeper share view** at `/bookkeeper/<token>` showing scoped
   invoice list and approve buttons.
   Caption: *"Send the queue to your bookkeeper. They review. You stay in
   control."*

## Support and legal

| Field | Value |
|------|-------|
| Support contact email | <support@paid-app.com> |
| Support URL | <https://paid-app.com/support> *(create if it doesn't exist; can be a Notion page or simple route)* |
| Privacy policy URL | <https://paid-app.com/privacy> |
| Terms of service URL | <https://paid-app.com/terms> |
| Languages supported | English (US) |
| Distribution | Public · Available in all regions |

## Pricing model in the listing

Pick **Free trial / paid subscription**. We do not bill through Google.
Description text:

> Free 30-day trial, then $49–$399/month depending on plan. Billed by
> Paid via Stripe. Cancel anytime. See <https://paid-app.com/pricing>.

## Marketplace SDK App Integration

In the SDK config:

- **Universal navigation extension** — leave blank (we do not need it).
- **Drive extension** — disabled.
- **Calendar extension** — disabled.
- **Gmail extension** — enabled. Add-on script ID: paste from Apps Script
  → Project Settings → Script ID.
- **Editor add-on** — disabled.

## After publishing

- Workspace Marketplace listing review takes **1–2 weeks** after OAuth
  verification clears. They will not start the listing review until
  verification is approved.
- Use the listing URL once live to drive installs from the Paid web app
  (Settings page already references the test deployment URL — swap it for
  the public marketplace URL after launch).

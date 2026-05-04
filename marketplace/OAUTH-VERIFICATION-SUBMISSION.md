# OAuth verification submission — paste into Google Cloud Console

This document is the source of truth for everything Google's OAuth
verification form will ask you. Open the form here:

> Google Cloud Console → APIs & Services → OAuth consent screen → Edit App

Use the same Cloud project that hosts the Apps Script add-on AND the
Next.js web app's Google client (they must be the same project —
verification is project-wide).

**Paid uses no restricted Google scopes.** Verification is required for
the sensitive Workspace Add-On scopes, but no CASA Tier 2 security
assessment is required. Realistic timeline: **3–6 weeks** for verification.

---

## 1. App information

| Field | Value |
|------|-------|
| App name | **Paid** |
| User support email | <support@paid-app.com> |
| App logo | Upload `public/marketplace/icon-128.png` (also live at https://paid-app.com/marketplace/icon-128.png) |
| Application home page | https://paid-app.com |
| Application privacy policy | https://paid-app.com/privacy |
| Application terms of service | https://paid-app.com/terms |
| Authorized domains | `paid-app.com` |
| Developer contact information | <support@paid-app.com> |

User type: **External**. Publishing status: **In production** (only after
the verification submit).

## 2. Scopes

Add every scope the project will request, even if some are only used by
the Apps Script add-on. Verification reviews all scopes together.

### Sensitive scopes (Gmail Add-On)

| Scope | What it does | Why we need it |
|-------|--------------|----------------|
| `https://www.googleapis.com/auth/gmail.addons.execute` | Lets the Workspace Add-On run | Required for the add-on to render any UI in Gmail. |
| `https://www.googleapis.com/auth/gmail.addons.current.message.metadata` | Read From/To/Subject of the open message | We use sender and recipient addresses to match the open thread to invoices in the user's QuickBooks (so we can show "this person owes you $5,200"). |
| `https://www.googleapis.com/auth/gmail.addons.current.message.readonly` | Read the body of the open message **only when the user clicks "Classify reply"** | We need the message body to classify a client's reply (e.g., "will pay next week", "invoice issue") and suggest a next step. We never read messages other than the one the user opened, and only after an explicit click. |
| `https://www.googleapis.com/auth/gmail.addons.current.action.compose` | Open a Gmail compose window prefilled with our draft | Lets the user click "Open in Gmail to send" so they see a prefilled compose window and click Send themselves in Gmail. This is how Paid avoids using gmail.send. |
| `https://www.googleapis.com/auth/script.external_request` | Apps Script URL Fetch to our backend | Required to call our REST API from inside the add-on. |
| `https://www.googleapis.com/auth/script.locale` | Read the user's locale | For correct date/currency formatting. |

### Non-restricted basic scope (web app)

| Scope | What it does | Why we need it |
|-------|--------------|----------------|
| `https://www.googleapis.com/auth/userinfo.email` | Read the user's primary email address | We bind the OAuth grant to the correct Paid account; the address is shown in the UI as "connected as you@firm.com" so the user can confirm it before any action. |

### What Paid deliberately does NOT request

- `gmail.send` — Paid never sends email programmatically. After the user
  approves a reminder, we open a prefilled Gmail compose window; the user
  clicks Send in Gmail. This is enforced in code: there is no call site
  for Gmail's send API in the codebase.
- `gmail.modify`, `gmail.readonly`, `gmail.compose`, `gmail.metadata` —
  not needed; the add-on reads only the body of the open message via the
  `addons.current.message.readonly` scope after an explicit user click.
- `https://www.googleapis.com/auth/gmail.readonly` — never requested. We
  do not scan inboxes in the background.

### Limited Use justification (paste verbatim into the form)

> Paid's use and transfer to any other app of information received from
> Google APIs will adhere to the Google API Services User Data Policy,
> including the Limited Use requirements. We use Google user data only to
> (a) display the user's connected email address, (b) prepare payment
> reminder drafts that the user opens in Gmail's compose window and sends
> themselves, and (c) classify the body of a single open client reply
> when the user explicitly clicks "Classify reply" inside our add-on. Raw
> message bodies are processed in transit, not retained, not used for
> advertising, not transferred to third parties except as needed to render
> those user-facing features (Anthropic for AI drafting and
> classification — see our Privacy Policy), and not used to train
> generalized AI models.

## 3. Test users (during pre-submission testing)

Add these manually before submission so internal users can sign in while
the app is still in Testing mode:

- you@paid-app.com (developer)
- 2-3 friendly first customers (their Gmail addresses)
- demo@paid-app.com (account used for the verification video)

## 4. App description (for OAuth consent screen "App information")

> Paid helps small professional services firms — engineering,
> architecture, environmental, and similar — collect overdue invoices.
> We sync your unpaid invoices from QuickBooks and draft AI-generated
> payment reminders in your voice. When you approve a draft, Paid opens
> Gmail's compose window prefilled with the message; you click Send
> yourself in Gmail. Paid never sends email on your behalf. The Paid
> Gmail Add-On surfaces the same queue inside Gmail and lets you
> classify client replies with one click.

## 5. After form submission

- Google sends you an automated confirmation; verification for sensitive
  (non-restricted) scopes typically takes **3–6 weeks**.
- Watch the dev contact inbox for "more info needed" messages. Reviewers
  often ask 2–3 follow-up questions; respond same-day to shave weeks off.
- **No CASA security assessment is required** because Paid uses no
  restricted scopes.

## 6. Quick edits if reviewers push back

- **"How does Paid actually send email if it doesn't request gmail.send?"**
  → The merchant clicks "Open in Gmail to send" in our UI; we generate a
  Gmail compose URL (https://mail.google.com/mail/?view=cm&fs=1&...)
  prefilled with the draft, and the merchant clicks Send themselves in
  Gmail. The Apps Script add-on uses CardService's OpenLink action to do
  the same in-product. There is no call site for Gmail's send API in our
  codebase.
- **"Why do you need readonly?"** → It is scoped to
  `current.message.readonly` and is only invoked after an explicit
  user-initiated action ("Classify reply" button). The scope is required
  by Workspace Add-Ons that read message bodies; metadata-only is
  insufficient because the classifier needs the body text.
- **"Where is your data deletion process?"** → `Settings → Disconnect
  Gmail` revokes the refresh token and deletes stored OAuth credentials.
  Account deletion is requested via support@paid-app.com and processed
  within 30 days per the Privacy Policy.

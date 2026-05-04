# Demo video script for OAuth verification

Google requires a screen-recorded walkthrough that shows (a) the OAuth grant
flow and (b) every requested scope being used in-product, with a verbal or
on-screen reason for each. ~3 minutes is right; under 2 reads as rushed,
over 4 wastes the reviewer's time.

Record at 1080p. Host on YouTube as **Unlisted**. Paste the URL into the
verification form.

Use a clean test account (`demo@paid-app.com` works), not your real one.

---

## Setup before pressing Record

- Sign out of the demo Google account in the browser.
- Have one test customer in QuickBooks (test company) with one unpaid invoice
  that is 60+ days overdue. Note the customer's email address.
- Send an email to that test customer's address from the demo Google account
  (or stub a "client reply" thread in your inbox saying *"Hi, can I pay
  next week?"*) so you can demonstrate the Classify reply flow.
- Have the Paid Gmail Add-On installed in the demo account from the test
  deployment.

## Script (read it aloud while you screen-record)

**[0:00 — title card, 3 sec]**
Visible: **Paid OAuth verification demo · paid-app.com**

**[0:03 — sign-in / OAuth grant flow]**
Voice: *"This is Paid, an AI-assisted invoice collections tool for
professional services firms. I'll show you how each requested OAuth scope
is used. First, the consent flow."*

Action: Open `https://paid-app.com`, click **Sign in**, choose Google,
proceed through the consent screen. Pause for 2 seconds on the consent
screen so the reviewer can read the requested scopes.

**[0:25 — gmail.send and userinfo.email]**
Voice: *"After consent, Paid stores the refresh token and shows the
connected Gmail address — that's the `userinfo.email` scope. We use this
purely to bind the OAuth grant to the correct Paid account and display it
back to the user."*

Action: On `/dashboard`, hover the connected email pill at the top.

**[0:45 — Approve & open in Gmail (no gmail.send used)]**
Voice: *"Paid does not use the gmail.send scope. When the merchant
approves a reminder, we open Gmail's compose window prefilled with the
draft. The merchant clicks Send themselves in Gmail. Watch."*

Action: Open Gmail (separate tab), click the Paid Add-On icon. The
sidebar shows overdue invoices. Click **Send all reminders** → it
queues drafts. Open one — show the draft preview card. Click **Open in
Gmail to send**. Gmail opens a new compose window prefilled with the To,
Subject, and Body. The merchant clicks Send. Switch to Gmail Sent
folder to verify the message went out via the merchant's own click.

**[1:30 — gmail.addons.* scopes]**
Voice: *"The Workspace Add-On uses the four `gmail.addons.*` scopes:
execute lets the add-on render in Gmail; current.message.metadata is
how we match the open thread's From address to a customer's invoices in
QuickBooks; current.action.compose is how we open a prefilled compose
window when the merchant wants to edit a draft inline."*

Action: Click on a thread from the test customer. The Paid contextual
card appears showing their open invoices. Click **Edit in Gmail** on a
draft — show the compose window opens prefilled.

**[2:10 — current.message.readonly and Classify reply]**
Voice: *"`current.message.readonly` is invoked only when the user
explicitly clicks 'Classify reply'. We do not read any other messages
in the inbox. We do not scan messages in the background. This action
reads only the body of the currently open thread, classifies it — for
example 'will pay next week' — and suggests a follow-up. The raw body
is sent to our classifier in transit, not retained."*

Action: Open the test "client reply" thread that says they can pay next
week. The contextual card now shows "This looks like a reply" → click
**Classify reply**. Show the result card with the classification and
scheduled follow-up date.

**[2:50 — Limited Use disclosure]**
Voice: *"Our Privacy Policy includes the Limited Use disclosure. We
don't use Gmail data for advertising, don't sell it, don't allow human
review except for the user's own messages they've already opened in our
UI, and don't use it to train generalized AI models."*

Action: Open `https://paid-app.com/privacy`, scroll to the **Limited
Use of Google user data** section, hold for 3 seconds.

**[3:10 — wrap]**
Voice: *"Thanks for reviewing. Source code is available on request to
your Trust & Safety team. Contact support@paid-app.com."*

End.

---

## After recording

- Upload to YouTube → **Unlisted** (NOT Public, NOT Private).
- Title: `Paid — OAuth verification demo (paid-app.com)`.
- Description: paste your contact email and a one-line app summary.
- Disable comments to keep the page clean.
- Paste the URL into the OAuth consent screen verification form's "App
  demo video" field.

## Common reasons reviewers reject videos

- The OAuth consent screen scrolls by too fast — pause 2+ seconds on it.
- A scope is requested but never demonstrated being used. Verify each of
  the seven scopes appears at least once in your recording.
- The video is on a personal YouTube channel that doesn't match the brand —
  upload to a Paid-branded channel.
- The Privacy Policy URL shown in the video doesn't match the URL in the
  form — keep them identical.

# Marketplace approval — master checklist

This is the single source-of-truth for getting Paid listed in Google
Workspace Marketplace.

**Good news:** Paid uses no restricted Google scopes (we removed
`gmail.send` and never request `gmail.readonly`, `gmail.modify`, or
`gmail.compose`). That means **no CASA Tier 2 security assessment is
required** — saving ~$5–15k and 3–8 weeks. Realistic timeline from a
clean start: **5–8 weeks**.

The slow thing is OAuth verification (3–6 weeks for sensitive
non-restricted scopes). Submit it on day one; do everything else in
parallel.

---

## Phase 1 — Code/infra prep (you can do this now)

- [x] Update `appsscript.json` logo URL to a real Paid asset (done).
- [x] Add Limited Use disclosure to `/privacy` (done).
- [x] Strip `gmail.send` from the web OAuth flow (done — see
      `app/api/auth/gmail/route.ts`).
- [x] Replace `sendGmailMessage` with `buildGmailComposeUrl` so Paid never
      calls Gmail's send API (done — see `lib/gmail/send.ts`).
- [ ] Save the four marketplace images at `public/marketplace/`:
      `icon-128.png`, `tile-220x140.png`, `tile-440x280.png`,
      `hero-1400x560.png`. Use Figma or a designer; placeholder OK for
      submission, swap before public launch.
- [ ] Take five 1280×800 screenshots per the shot list in
      `marketplace/LISTING-COPY.md`.
- [ ] Verify the Google Cloud project containing your OAuth client is
      the **same** project that hosts the Apps Script add-on. If not,
      consolidate. Verification is project-wide.
- [ ] Make sure paid-app.com is verified in Google Search Console with
      the same email that owns the Cloud project. Required for "authorized
      domains" in the consent screen.
- [ ] Create `support@paid-app.com` (Google Workspace mailbox is fine).
      Reviewers email this address.
- [ ] Create `https://paid-app.com/support` (can be a one-page Notion
      embed). Listing requires a public support URL.

## Phase 2 — Submit OAuth verification (week 1)

Use the script in `marketplace/OAUTH-VERIFICATION-SUBMISSION.md`.

- [ ] Confirm OAuth consent screen is set to **External** and **In
      production** (not Testing).
- [ ] Add every scope from the submission doc. Confirm `gmail.send` is
      NOT in the list.
- [ ] Paste the per-scope justifications.
- [ ] Paste the Limited Use justification.
- [ ] Record the demo video using `marketplace/DEMO-VIDEO-SCRIPT.md`.
      Update the script to show the new "Open in Gmail to send" flow
      instead of an in-product send. Upload as YouTube Unlisted.
- [ ] Paste the YouTube URL into the verification form.
- [ ] Submit.
- [ ] Watch <support@paid-app.com> daily for reviewer messages. They
      typically come back with 2–3 follow-up questions. Same-day replies
      shave weeks off the wait.

## Phase 3 — Marketplace SDK config (do this in parallel)

Even though you can't publish until verification clears, you can fill
out the Marketplace SDK now.

- [ ] In Cloud Console, enable the **Google Workspace Marketplace SDK**
      API.
- [ ] Open Marketplace SDK → **App Configuration**. Paste values from
      `marketplace/LISTING-COPY.md` and connect the Apps Script script ID.
- [ ] Open Marketplace SDK → **Store Listing**. Paste detailed
      description, upload icon and tiles, upload screenshots, set support
      URLs.
- [ ] Save as draft. Do NOT publish yet.

## Phase 4 — OAuth verification approved (week 3–6)

- [ ] Confirm via the Cloud Console that your project shows "Verified"
      with all scopes approved.
- [ ] In Marketplace SDK → Store Listing, click **Submit for review**.
      This kicks off the marketplace editorial review (1–2 weeks).

## Phase 5 — Marketplace listing approved (week 5–8)

- [ ] Click **Publish** in Marketplace SDK.
- [ ] Verify the public listing URL works for an account that has not
      installed the add-on.
- [ ] Update the install link in `components/SettingsClient.tsx`
      (`GMAIL_ADDON_INSTALL_URL`) from the test deployment URL to the
      public marketplace URL.
- [ ] Commit and redeploy. Done.

## Things that commonly break the timeline

- **Project mismatch.** Apps Script add-on in one Cloud project, web app
  OAuth client in another. Verification is project-wide; you'll go
  through twice. **Fix:** consolidate before submitting.
- **Privacy policy URL mismatch.** The URL in the consent screen, the
  URL in the demo video, the URL in the Marketplace listing must all be
  identical. Trailing slashes count.
- **Logo not on your domain.** Reviewers reject placeholder logos and
  logos hosted on storage URLs. Host at
  <https://paid-app.com/marketplace/icon-128.png>.
- **Demo video uploaded as Public or Private.** Must be **Unlisted**.
- **Verbal scope justifications missing on video.** Each scope needs to
  be heard or seen in the recording. Don't rush.
- **Inconsistent app name.** "Paid", "paid-app", "Paid AI" — pick one
  and use it everywhere.
- **Missing support email or URL.** Both must be live and respond.
- **Reviewer asks "how do you send email?"** Show them the
  `lib/gmail/send.ts` `buildGmailComposeUrl` function and the
  `app/api/invoices/send-reminder/route.ts` route — neither calls Gmail's
  send API. There is no call site in the codebase for `gmail.send`.

## What's in this folder

- `OAUTH-VERIFICATION-SUBMISSION.md` — text for the OAuth consent form.
- `DEMO-VIDEO-SCRIPT.md` — script for the verification video. Update
  the "Send" segment to show "Open in Gmail to send" instead of an
  in-product send.
- `LISTING-COPY.md` — text and asset shot-list for the Marketplace
  listing.
- `CASA-AND-CHECKLIST.md` — this file.

## Bottom line

Path to a public Marketplace listing if you start today: **5–8 weeks**.
The remaining things you must do yourself, in priority order:

1. **Today:** consolidate the Cloud project if Apps Script and web OAuth
   are in different ones.
2. **This week:** stand up support@paid-app.com and /support.
3. **This week:** re-record the demo video to reflect the new
   no-gmail-send flow ("Open in Gmail to send").
4. **This week:** submit OAuth verification with the demo video URL.
5. **Weeks 1–6:** answer reviewer follow-ups same-day.
6. **Weeks 5–8:** click Publish.

Realistic ship date if you start today: **mid- to late June**.

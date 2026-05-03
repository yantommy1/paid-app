# Paid v2 — what changed and how to ship it

This release repositions Paid as an A/E-vertical product and adds tone control,
reply classification, Pay Now buttons, an ROI dashboard, and a bookkeeper share link.

## 1. Database migration

Run the new migration in Supabase:

```
supabase/migrations/20260503000000_paid_v2.sql
```

It is idempotent (every change uses `if not exists` / `if exists`). It adds:

- `users.company_vertical`
- `settings.tone_default`, `tone_auto_adjust`, `payment_link_enabled`,
  `early_pay_discount_pct`, `early_pay_discount_days`, `payment_plan_enabled`,
  `payment_plan_installments`, `pay_now_button_label`
- `invoices.pay_link_url`, `pay_link_amount_cents`, `pay_link_discount_pct`,
  `pay_link_expires_at`, `payment_plan_link_url`
- New table `reply_classifications`
- New table `reminder_schedules`
- New table `bookkeeper_invites`
- `reminder_logs.tone`, `pay_link_included`, `discount_pct`, `thread_id`
- Default `auto_send_enabled` is now `false` for new accounts.

## 2. Stripe — add the Firm tier

In the Stripe Dashboard, create a new recurring price for the Firm plan
($399/mo) and add it to the project as:

```
STRIPE_FIRM_PRICE_ID=price_...
```

Existing `STRIPE_STARTER_PRICE_ID` and `STRIPE_PRO_PRICE_ID` continue to work
but should be repointed at $49/mo and $129/mo prices respectively (create new
ones; do not edit the live price points).

## 3. Environment variables (.env.local + Vercel)

New variables:

| Variable | Notes |
|----------|-------|
| `STRIPE_FIRM_PRICE_ID` | New Firm tier price |
| `ANTHROPIC_REPLY_MODEL` | Optional; defaults to `claude-3-5-haiku-20241022` for fast, cheap reply classification |

No other env changes.

## 4. New routes

- `GET /pay/[invoiceId]` — public Pay Now redirect; creates a Stripe Checkout
  session at click time on the merchant's connected account.
- `GET /pay/[invoiceId]/plan` — payment plan landing page; opens a pre-written
  email to the merchant.
- `GET /pay/thanks | canceled | already-paid | not-configured | not-found | error`
  — status pages.
- `GET /bookkeeper/[token]` — magic-link landing for an invited bookkeeper;
  scoped read+approve view.
- `POST /api/replies/classify` — classifies a client reply, persists it, and
  schedules a follow-up if the client promised a future pay date.
- `POST /api/bookkeeper/invites` — owner creates a bookkeeper invite (and
  optionally sends the email from their own Gmail).
- `GET /api/bookkeeper/invites` — list invites.
- `DELETE /api/bookkeeper/invites` — revoke.
- `POST /api/bookkeeper/[token]/draft` — bookkeeper triggers a draft.
- `POST /api/bookkeeper/[token]/approve` — bookkeeper approves and sends.
- `GET /api/dashboard/roi` — feeds the dashboard ROI hero.

## 5. Behavior changes

- **No auto-send.** Per the product decision, `processDailyReminders` (cron)
  always queues drafts; the `auto_send_enabled` setting is ignored. The flag
  remains in the DB as a placeholder for a future opt-in. No code path sends
  email without an explicit human approval action.
- **Tone slider.** Every reminder now carries a tone (`friendly` |
  `professional` | `firm`). `tone_auto_adjust` (default on) biases tone by
  client history (prior late payments → firmer, prior on-time → friendlier),
  invoice size (≥ $10k → firmer), and days overdue (60+ → always firm).
  Configure defaults in Settings. The Gmail Add-On's draft preview will pick
  this up via the API response.
- **Pay Now.** Every reminder gets a Pay Now URL appended after the sign-off:
  `${NEXT_PUBLIC_APP_URL}/pay/<invoice_id>?d=<discount_pct>&dd=<days>`. Discount
  is only applied if the link is clicked within `dd` days of the reminder send.
  Requires Stripe Connect to be set up; if not, the email goes out without the
  Pay Now block.
- **ROI hero on dashboard.** "We've recovered $X for you" with this-month,
  invoices-recovered, avg days-from-reminder-to-payment, and drafts-waiting
  tiles.
- **Bookkeeper share.** Owner invites a bookkeeper from Settings → Send to
  bookkeeper. Bookkeeper gets a 60-day magic link to a scoped view of overdue
  invoices and the draft queue. With `send` permission they can approve and
  send drafts; the email goes out from the OWNER's Gmail, not the bookkeeper's.
- **Reply classification (in-add-on).** When the user opens a Gmail message
  that looks like a client reply, the contextual card now offers a "Classify
  reply" button. The add-on reads the message body, POSTs to
  `/api/replies/classify`, and shows the classification + suggested next step
  + (if applicable) the auto-scheduled follow-up date.

## 6. Settings UI

Two new sections appear on `/settings`:

- **Reminder preferences** — tone defaults, auto-adjust, Pay Now toggle &
  label, early-pay discount % + window, payment plan availability + months.
- **Send to bookkeeper** — invite email + permission selector + active
  invites list with revoke.

## 7. Marketing copy

- Hero: "We turn your inbox into your collections team."
- Subhead: outcome-driven, A/E framing, plus a one-line developer-credibility
  note.
- Vertical strip: Civil / Structural / Environmental / Architecture / MEP &
  Surveying.
- "AR Reality" stats refreshed to A/E-specific industry numbers (76 days DSO,
  $180k typical A/R, 1 in 3 invoices never followed up).
- "Testimonials" replaced with anonymized "what owners tell us" pattern quotes
  (role + segment, no fake names).
- Pricing: $49 / $129 / $399 — Starter / Pro / Firm.
- Final CTA: "Stop letting your A/R sit there."

## 8. Things you still need to do manually

- Create the new Stripe prices and set the env var.
- Run the migration in Supabase.
- Replace the placeholder testimonials with real ones as you collect them
  (currently anonymized pattern quotes — defensible but not as strong as named
  customers).
- Apply for Workspace Marketplace listing if you have not already — this is
  not blocked by these changes but is independently required.
- Re-publish the Gmail Add-On (the `Code.gs` got two new functions and a
  contextual button). In Apps Script: Deploy → Test deployments → reinstall.

## 9. Things deliberately left for a follow-up

- Background reply classification via Gmail Pub/Sub watch (v1 is in-add-on
  only, per your call).
- Real installment billing for the payment plan (v1 opens a pre-written
  mailto so the merchant negotiates terms manually).
- "Firm" multi-client dashboard for bookkeepers managing multiple owner books
  (v1 sells the Firm tier but the multi-client view is a follow-up sprint).
- Annual prepay pricing — easy to add when needed by creating annual prices in
  Stripe and adding tier toggles in `PricingPlans`.

# Paid — deployment and publishing guide

This document covers environment variables, Supabase, Vercel, Stripe Connect, the daily cron job, and publishing the Gmail Workspace Add-On.

## 1. Repository layout (Next.js app)

```text
paid/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── gmail/route.ts          # Gmail OAuth start + callback
│   │   │   ├── quickbooks/route.ts     # QuickBooks OAuth start + callback
│   │   │   └── session-token/route.ts  # JSON JWT for Apps Script
│   │   ├── cron/daily/route.ts         # Vercel Cron: QB sync + reminders
│   │   ├── invoices/
│   │   │   ├── route.ts                # GET list (add-on sidebar)
│   │   │   ├── by-contact/route.ts      # GET ?email=…
│   │   │   ├── draft-reminder/route.ts
│   │   │   ├── mark-paid/route.ts
│   │   │   ├── queue-bulk-drafts/route.ts
│   │   │   ├── send-reminder/route.ts
│   │   │   ├── summary/route.ts         # Cohort totals
│   │   │   └── sync/route.ts
│   │   ├── settings/route.ts
│   │   └── stripe/
│   │       ├── connect/route.ts
│   │       ├── checkout-invoice/route.ts
│   │       └── webhook/route.ts
│   ├── auth/callback/route.ts          # Supabase magic-link callback
│   ├── onboarding/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                        # Landing + magic link
├── components/
├── google-apps-script/
│   ├── appsscript.json                 # Gmail add-on manifest
│   └── Code.gs                         # Sidebar + contextual + compose + bulk queue
├── lib/                                # QB, Gmail, Anthropic, Stripe, fees, Supabase helpers
├── supabase/migrations/
│   └── 20260418000000_initial.sql
├── middleware.ts
├── next.config.ts
├── vercel.json                         # Cron schedule
├── .env.example
├── tailwind.config.ts
├── postcss.config.mjs
└── package.json
```

## 2. Environment variables

Copy `.env.example` to `.env.local` for development and configure the same keys in Vercel (Production + Preview).

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Public site URL, e.g. `https://getpaid.ai` — also used in OAuth redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser + server with user JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only: cron, admin token updates) |
| `ANTHROPIC_API_KEY` | Claude for reminder drafts |
| `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` | Intuit OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (Gmail send) — same Cloud project as the add-on |
| `STRIPE_SECRET_KEY` | Stripe secret (platform account) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe/webhook` |
| `CRON_SECRET` | Optional shared secret for manual `Authorization: Bearer …` cron calls |

**Redirect URIs (OAuth consoles)**

- Google: `{NEXT_PUBLIC_APP_URL}/api/auth/gmail`
- Intuit: `{NEXT_PUBLIC_APP_URL}/api/auth/quickbooks`

**Supabase Auth URL config**

- Site URL: `NEXT_PUBLIC_APP_URL`
- Redirect URLs: `{NEXT_PUBLIC_APP_URL}/auth/callback**`

## 3. Supabase

1. Create a project and run `supabase/migrations/20260418000000_initial.sql` in the SQL editor (or `supabase db push`).
2. Enable **Email** auth (magic link) under Authentication → Providers.
3. RLS policies are included in the migration; service role bypasses RLS for cron/admin paths.

## 4. Deploy to Vercel

1. Push the `paid` folder to a Git repository.
2. Import the repo in [Vercel](https://vercel.com) and set the **root directory** to `paid` if the repo contains multiple projects.
3. Add all environment variables from section 2.
4. Deploy. `vercel.json` schedules `GET /api/cron/daily` daily (UTC). Vercel injects `x-vercel-cron: 1`, which the route accepts; you can also call with `Authorization: Bearer $CRON_SECRET`.
5. Point your domain (e.g. **getpaid.ai**) to the Vercel project and set `NEXT_PUBLIC_APP_URL` to that URL, then redeploy.

## 5. Stripe Connect

1. In the Stripe Dashboard (platform account), enable **Connect** (Express is implemented in code).
2. Create a webhook endpoint URL: `{NEXT_PUBLIC_APP_URL}/api/stripe/webhook` and subscribe at minimum to `checkout.session.completed` and `payment_intent.succeeded`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Users complete Connect via **POST `/api/stripe/connect`** from onboarding; the connected account id is stored on `public.users`.
4. **POST `/api/stripe/checkout-invoice`** with `{ "invoiceId": "<uuid>" }` creates a Checkout Session on the connected account with `application_fee_amount` set from your contingency fee settings (60d/90d tiers).

## 6. Gmail Workspace Add-On (Google Apps Script)

1. Go to [script.google.com](https://script.google.com) and create a project, or use [clasp](https://github.com/google/clasp) to push `google-apps-script/` (`appsscript.json` + `Code.gs`).
2. In **Project Settings → Script properties**, set `PAID_API_BASE` (e.g. `https://getpaid.ai`) and optionally `PAID_JWT` (or use the in-UI form on first load).
3. Replace the placeholder `logoUrl` in `appsscript.json` with your hosted Paid logo (HTTPS).
4. Apps Script → **Deploy → Test deployments** — select type **Add-on** and install for a Workspace test user.
5. For marketplace listing: [Google Workspace Marketplace SDK](https://console.cloud.google.com/apis/library/appsmarket-component.googleapis.com) — create an OAuth consent screen (Internal or External), add scopes used by the add-on and backend, submit the listing with screenshots, privacy policy, and support URL.

**Linking the add-on to Supabase**

- While logged into the web app, open `/api/auth/session-token` and copy the `access_token` into the add-on (form or Script property `PAID_JWT`). JWTs expire; users can refresh by pasting a new token or you can add a small Apps Script OAuth flow later.

**Backend calls**

The script calls your deployed origin with `Authorization: Bearer <supabase_access_token>` on routes such as `/api/invoices/summary`, `/api/invoices`, `/api/invoices/by-contact`, `/api/invoices/send-reminder`, and `/api/invoices/queue-bulk-drafts`.

## 7. QuickBooks and Gmail production checklist

- Intuit: production app approval for `com.intuit.quickbooks.accounting` scope.
- Google: verify the OAuth brand and sensitive scopes (`gmail.send`) if applicable to your workspace type.

## 8. Operational notes

- **Daily job**: `/api/cron/daily` refreshes QuickBooks tokens, syncs invoices for each user with QB connected, then runs reminder processing (auto-send or queue per `settings.auto_send_enabled`).
- **Contingency fees**: Recorded when an invoice is marked paid via **POST `/api/invoices/mark-paid`** or when Stripe webhooks mark it paid, using `settings.fee_60_day` / `fee_90_day` (defaults 5% / 10%).
- **Manual mark-paid idempotency**: Duplicate fee rows for the same invoice are avoided when possible.

For questions or hardening (token refresh in the add-on, Payment Link alternatives, stricter reminder cadence), iterate from this baseline.

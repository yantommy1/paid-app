-- Track first-time setup completion; returning users skip /onboarding.

alter table public.users
  add column if not exists onboarding_completed boolean not null default false;

-- Existing accounts that already connected both integrations are treated as onboarded.
update public.users
set onboarding_completed = true
where quickbooks_token is not null
  and gmail_token is not null
  and onboarding_completed = false;

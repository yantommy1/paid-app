ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_status text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

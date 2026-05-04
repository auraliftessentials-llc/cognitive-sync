-- ===== Plan tier enum =====
DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('free_trial','operator','architect','sovereign','lifetime');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== Subscriptions =====
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  tier public.plan_tier NOT NULL DEFAULT 'free_trial',
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  payment_method_attached boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  status text NOT NULL DEFAULT 'trialing',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "users update own subscription" ON public.subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "super admin full subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'super_admin'::app_role));

CREATE TRIGGER trg_sub_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Usage events (metering) =====
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  task_kind text,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  cost_usd numeric(10,6) DEFAULT 0,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON public.usage_events(user_id, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own usage" ON public.usage_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "users insert own usage" ON public.usage_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ===== Frontier Intelligence =====
CREATE TABLE IF NOT EXISTS public.frontier_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  url text,
  summary text NOT NULL,
  impact_score integer NOT NULL DEFAULT 5,
  tags text[] NOT NULL DEFAULT '{}',
  raw jsonb NOT NULL DEFAULT '{}',
  discovered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intel_recent ON public.frontier_intel(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_category ON public.frontier_intel(category, discovered_at DESC);

ALTER TABLE public.frontier_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read intel" ON public.frontier_intel
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manage intel" ON public.frontier_intel
  FOR ALL TO authenticated USING (has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'super_admin'::app_role));

-- ===== Infrastructure registry =====
CREATE TABLE IF NOT EXISTS public.infra_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  endpoint text,
  status text NOT NULL DEFAULT 'unknown',
  metrics jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.infra_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own infra" ON public.infra_resources
  FOR ALL TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE TRIGGER trg_infra_updated BEFORE UPDATE ON public.infra_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Auto-create trial on signup, lifetime for super_admins =====
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, tier, trial_started_at, trial_ends_at, status)
  VALUES (
    NEW.id,
    'free_trial'::public.plan_tier,
    now(),
    now() + interval '3 days',
    'trialing'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- ===== Helper: effective access (super_admin = lifetime) =====
CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND (
          s.tier IN ('operator','architect','sovereign','lifetime')
          OR (s.tier = 'free_trial' AND s.trial_ends_at > now())
        )
    );
$$;
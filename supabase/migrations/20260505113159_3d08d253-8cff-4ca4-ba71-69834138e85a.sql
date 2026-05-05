-- Idempotency support on merkabah_commands
ALTER TABLE public.merkabah_commands
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS merkabah_commands_user_idem_key
  ON public.merkabah_commands(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS public.command_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['command.complete','command.error'],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_delivery_at timestamptz,
  last_status text
);

ALTER TABLE public.command_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own webhooks"
  ON public.command_webhooks
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_command_webhooks_updated_at
  BEFORE UPDATE ON public.command_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS public.command_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.command_webhooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  command_id uuid,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  http_status integer,
  response_body text,
  error text,
  attempt integer NOT NULL DEFAULT 1,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.command_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own deliveries"
  ON public.command_webhook_deliveries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS command_webhook_deliveries_webhook_idx
  ON public.command_webhook_deliveries(webhook_id, created_at DESC);
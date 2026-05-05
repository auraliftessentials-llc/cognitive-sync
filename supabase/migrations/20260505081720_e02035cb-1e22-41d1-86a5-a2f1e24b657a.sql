-- Constellation registry: every node in the Operator's empire
CREATE TABLE IF NOT EXISTS public.infra_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('project','agent','cloud','datastore','bridge','external')),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','degraded','offline','unknown','provisioning')),
  endpoint_url text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_health_at timestamptz,
  last_health_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_infra_resources_user ON public.infra_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_infra_resources_kind ON public.infra_resources(kind);

ALTER TABLE public.infra_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own resources"
  ON public.infra_resources FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Owner can insert own resources"
  ON public.infra_resources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can update own resources"
  ON public.infra_resources FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Owner can delete own resources"
  ON public.infra_resources FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_infra_resources_updated_at
  BEFORE UPDATE ON public.infra_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.infra_resources;
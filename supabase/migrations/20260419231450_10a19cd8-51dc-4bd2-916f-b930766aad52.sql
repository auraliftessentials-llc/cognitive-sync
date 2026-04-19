
CREATE TABLE IF NOT EXISTS public.brain_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ok','degraded','down','unconfigured')),
  http INTEGER,
  message TEXT,
  latency_ms INTEGER,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_health readable by authenticated" ON public.brain_health;
CREATE POLICY "brain_health readable by authenticated"
  ON public.brain_health
  FOR SELECT
  TO authenticated
  USING (true);

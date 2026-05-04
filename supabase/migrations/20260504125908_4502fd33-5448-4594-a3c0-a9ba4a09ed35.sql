-- Merkabah command log: every Operator command (UI, CLI, bridge) lands here.
CREATE TABLE public.merkabah_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'ui',           -- ui | cli | bridge | api
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'executing',    -- executing | complete | error
  result JSONB,
  winner TEXT,                                  -- which race peer won
  latency_ms INTEGER,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merkabah_commands_user_created
  ON public.merkabah_commands (user_id, created_at DESC);

ALTER TABLE public.merkabah_commands ENABLE ROW LEVEL SECURITY;

-- Operator sees + manages only their own commands. Super admin sees all.
CREATE POLICY "own commands select"
  ON public.merkabah_commands FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "own commands insert"
  ON public.merkabah_commands FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own commands update"
  ON public.merkabah_commands FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_merkabah_commands_updated_at
  BEFORE UPDATE ON public.merkabah_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime so any client (PWA, console, bridge UI) sees status flip live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.merkabah_commands;
-- Scheduled CLI prompts: a user can save "every morning at 9, ask brain X"
CREATE TABLE public.cli_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  cron text NOT NULL,                                -- 5-field cron expression
  prompt text NOT NULL,
  agent_slug text NOT NULL DEFAULT 'ceo-grok',
  model text,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_output text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cli_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own schedules"
  ON public.cli_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "super_admin all schedules"
  ON public.cli_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_cli_schedules_updated
  BEFORE UPDATE ON public.cli_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cli_schedules_user ON public.cli_schedules(user_id);
CREATE INDEX idx_cli_schedules_enabled ON public.cli_schedules(enabled) WHERE enabled = true;
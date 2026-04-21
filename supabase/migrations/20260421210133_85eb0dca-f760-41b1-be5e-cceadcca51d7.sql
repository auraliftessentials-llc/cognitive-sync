-- Per-run history for cli_schedules: every execution logs a row.
CREATE TABLE public.cli_schedule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.cli_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  trigger text NOT NULL DEFAULT 'cron', -- 'cron' | 'manual' | 'retry'
  status text NOT NULL DEFAULT 'running', -- 'running' | 'ok' | 'error'
  attempt integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  output text,
  error text,
  model text,
  provider text
);

CREATE INDEX idx_cli_schedule_runs_schedule_id ON public.cli_schedule_runs(schedule_id, started_at DESC);
CREATE INDEX idx_cli_schedule_runs_user_id ON public.cli_schedule_runs(user_id, started_at DESC);

ALTER TABLE public.cli_schedule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own schedule runs" ON public.cli_schedule_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users insert own schedule runs" ON public.cli_schedule_runs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "super_admin all schedule runs" ON public.cli_schedule_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Concurrency lock + diagnostics on the schedule itself.
ALTER TABLE public.cli_schedules
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_runs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_failures integer NOT NULL DEFAULT 0;

-- Cron heartbeat — every tick writes a row so we know cron is alive.
CREATE TABLE public.cron_heartbeat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  ticked_at timestamptz NOT NULL DEFAULT now(),
  due_count integer NOT NULL DEFAULT 0,
  ran_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  notes text
);

CREATE INDEX idx_cron_heartbeat_job_time ON public.cron_heartbeat(job, ticked_at DESC);

ALTER TABLE public.cron_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read heartbeat" ON public.cron_heartbeat
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin all heartbeat" ON public.cron_heartbeat
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Atomic claim: returns the schedule row only if not currently locked, and locks it.
CREATE OR REPLACE FUNCTION public.claim_schedule(_id uuid, _lock_seconds integer DEFAULT 300)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed boolean;
BEGIN
  UPDATE public.cli_schedules
     SET lock_until = now() + (_lock_seconds || ' seconds')::interval
   WHERE id = _id
     AND (lock_until IS NULL OR lock_until < now())
  RETURNING true INTO claimed;
  RETURN COALESCE(claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_schedule(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cli_schedules SET lock_until = NULL WHERE id = _id;
$$;
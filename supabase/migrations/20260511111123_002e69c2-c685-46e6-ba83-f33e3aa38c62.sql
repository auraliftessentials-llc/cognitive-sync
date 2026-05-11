-- Quiet Mode: a single feature flag the operator can flip to pause all autonomous activity.
-- Intent: "Operator is sitting with a decision. Don't act on their behalf until they say go."
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('quiet_mode', false, 'When on, pauses all cron jobs, outbound webhooks, and Mac Bridge event acceptance. The operator can still log in, read everything, and run commands manually. Lift only when the operator decides.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_quiet_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'quiet_mode' LIMIT 1), false);
$$;

REVOKE ALL ON FUNCTION public.is_quiet_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_quiet_mode() TO authenticated;
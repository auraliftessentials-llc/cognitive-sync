ALTER TABLE public.cli_schedules
  ADD COLUMN IF NOT EXISTS notify_email text,
  ADD COLUMN IF NOT EXISTS last_error_emailed_at timestamptz;
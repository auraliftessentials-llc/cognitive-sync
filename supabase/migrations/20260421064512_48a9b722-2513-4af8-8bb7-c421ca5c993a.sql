-- Schedule the cli_schedules tick to run every minute via pg_cron + pg_net
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-cli-schedules-every-minute') THEN
    PERFORM cron.unschedule('run-cli-schedules-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'run-cli-schedules-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://neural-guide-sync.lovable.app/hooks/run-cli-schedules',
    headers := '{"Content-Type":"application/json","Lovable-Context":"cron","Authorization":"Bearer sb_publishable_7jrg9P1F1_g72lcUdtUwuA_vBhkgm4T"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
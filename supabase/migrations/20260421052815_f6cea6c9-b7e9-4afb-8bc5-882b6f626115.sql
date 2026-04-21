create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any prior schedule with this name so re-running stays idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-github-sync') then
    perform cron.unschedule('daily-github-sync');
  end if;
end $$;

select cron.schedule(
  'daily-github-sync',
  '0 6 * * *', -- every day at 06:00 UTC
  $$
  select net.http_post(
    url := 'https://id-preview--9bab356d-3978-4977-aaa2-4d0d6b21f319.lovable.app/hooks/sync-github',
    headers := '{"Content-Type": "application/json", "Lovable-Context": "cron", "Authorization": "Bearer sb_publishable_7jrg9P1F1_g72lcUdtUwuA_vBhkgm4T"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
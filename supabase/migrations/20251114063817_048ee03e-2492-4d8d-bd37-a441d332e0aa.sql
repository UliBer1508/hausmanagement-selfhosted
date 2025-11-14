-- Aktiviere pg_cron falls nicht schon aktiv (sollte bereits aktiv sein)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Erstelle täglichen Cron-Job um 06:00 Uhr für automatische Mietzahlungs-Generierung
SELECT cron.schedule(
  'daily-tenant-payment-generation',
  '0 6 * * *',  -- Täglich um 6:00 Uhr
  $$
  SELECT net.http_post(
    url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/generate-tenant-payments',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI"}'::jsonb,
    body := '{"scheduled": true, "trigger": "cron"}'::jsonb
  ) as request_id;
  $$
);

-- Kommentar für Dokumentation
COMMENT ON EXTENSION pg_cron IS 'Tenant payment generation runs daily at 6:00 AM';
-- Erstelle Cron-Job für monatliches Scraping am 15. jeden Monats
-- Aktiviere pg_cron Extension falls noch nicht aktiviert
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Erstelle Cron-Job der am 15. jeden Monats um 3 Uhr morgens läuft
SELECT cron.schedule(
  'monthly-competitor-price-scraping',
  '0 3 15 * *', -- Um 3:00 Uhr am 15. Tag jeden Monats
  $$
  SELECT
    net.http_post(
        url:='https://usblrulkcgucxtkhugck.supabase.co/functions/v1/scrape-competitor-prices',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI"}'::jsonb,
        body:=concat('{"manual": false, "year": ', EXTRACT(YEAR FROM NOW()), '}')::jsonb
    ) as request_id;
  $$
);

-- Zeige alle aktiven Cron-Jobs
SELECT * FROM cron.job WHERE jobname LIKE '%competitor%';
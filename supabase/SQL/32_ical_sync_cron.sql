-- =============================================================================
-- 32_ical_sync_cron.sql
-- =============================================================================
-- ZWECK
--   Richtet den täglichen Cron-Job für ical-sync ein — 1x täglich, wie von Uli
--   gewünscht, gebündelt mit der Morgen-Automatik.
--
--   WICHTIG (Lektion 17.07.2026): Cron-Jobs wurden bisher NUR im Supabase-
--   Dashboard angelegt und existierten in KEINER Repo-Datei. Dadurch war nicht
--   nachvollziehbar, ob/wann etwas läuft (siehe die max-linen-reminders-Analyse).
--   Dieser Cron wird deshalb hier VERSIONIERT abgelegt.
--
-- ZEIT
--   06:20 deutsche Zeit. Als UTC im Sommer (MESZ, UTC+2) = 04:20.
--   Bewusst VOR der Morgen-Übersicht (06:30), damit frisch erkannte Kollisionen
--   noch in die Tagesübersicht einfließen. Nach Zeitumstellung ggf. anpassen
--   (die anderen Crons haben dasselbe Thema — siehe "Zeiten übernehmen").
--
-- IDEMPOTENT: löscht einen etwaigen alten Job gleichen Namens und legt neu an.
--   Ausführen im Supabase SQL-Editor (NICHT db push).
--
-- VORAUSSETZUNG: pg_cron + pg_net sind aktiv (werden von den bestehenden Crons
--   bereits genutzt, z.B. max-linen-reminders-daily).
-- =============================================================================

-- Alten Job (falls vorhanden) entfernen, damit die Neuanlage idempotent ist.
select cron.unschedule('ical-sync-daily')
where exists (select 1 from cron.job where jobname = 'ical-sync-daily');

-- Neu anlegen: täglich 04:20 UTC (= 06:20 MESZ), echter Lauf (dry_run:false).
select cron.schedule(
  'ical-sync-daily',
  '20 4 * * *',
  $$
  select net.http_post(
    url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/ical-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI'
    ),
    body := '{"dry_run": false}'::jsonb
  );
  $$
);

-- Kontrolle:
--   select jobname, schedule, active from cron.job where jobname = 'ical-sync-daily';

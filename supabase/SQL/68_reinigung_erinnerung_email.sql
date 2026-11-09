-- =============================================================================
-- 68_reinigung_erinnerung_email.sql
-- E-Mail-Erinnerung an Reinigungen für Dienstleister (zuerst: Boris)
-- =============================================================================
--
-- WARUM (09.11.2026):
-- Boris möchte erinnert werden, wenn er putzen muss. Bisher gab es nur das
-- Banner im Boris-Portal (nur sichtbar, wenn er das Portal öffnet) und die
-- Terminfrage von Max im Portal-Chat (max-cleaning-reminders, ohne Cron).
-- Eine E-Mail erreicht ihn auch, wenn er das Portal nicht öffnet.
--
-- WER STEUERT WAS:
--   Boris selbst stellt im Boris-Portal (Einstellungen → Benachrichtigungen)
--   ein, OB er eine Mail will, an WELCHE Adresse, WIE VIELE Tage vorher und
--   UM WIE VIEL UHR. Die Einstellung liegt in `notification_preferences`
--   (Zeile user_name = 'Boris') — dieselbe Tabelle, die das Portal schon
--   für seine Benachrichtigungen liest und schreibt.
--
--   Die Edge Function `reinigung-erinnerung` läuft stündlich, prüft je
--   Dienstleister, ob jetzt (deutsche Zeit) seine gewählte Stunde ist, und
--   schickt dann EINE Mail mit allen Reinigungen des Zieltags.
--
-- DOPPELVERSAND-SCHUTZ:
--   `reinigung_erinnerung_log` hält je Reinigung und Reinigungsdatum fest,
--   dass erinnert wurde. Wird eine Reinigung verschoben, ändert sich das
--   Datum → für den neuen Termin kommt wieder eine Erinnerung.
--
-- Idempotent: mehrfaches Ausführen ändert nichts weiter.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Einstellungen in notification_preferences
-- -----------------------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists provider_id uuid references public.service_providers(id),
  add column if not exists email_reminder_enabled boolean not null default false,
  add column if not exists email_reminder_days_before integer not null default 1,
  add column if not exists email_reminder_hour integer not null default 18,
  add column if not exists portal_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_preferences_email_reminder_days_chk'
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_email_reminder_days_chk
      check (email_reminder_days_before between 0 and 7);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_preferences_email_reminder_hour_chk'
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_email_reminder_hour_chk
      check (email_reminder_hour between 0 and 23);
  end if;
end $$;

comment on column public.notification_preferences.provider_id is
  'Dienstleister (service_providers.id), dessen Reinigungen in der E-Mail-Erinnerung stehen.';
comment on column public.notification_preferences.email_reminder_enabled is
  'E-Mail-Erinnerung an Reinigungen an/aus. Stellt der Dienstleister selbst im Portal ein.';
comment on column public.notification_preferences.email_reminder_days_before is
  '0 = am Reinigungstag selbst, 1 = am Vortag, ... bis 7.';
comment on column public.notification_preferences.email_reminder_hour is
  'Stunde (deutsche Zeit, 0-23), zu der die Erinnerung verschickt wird.';
comment on column public.notification_preferences.portal_url is
  'Link zum Portal des Dienstleisters, steht am Ende der Erinnerungs-Mail.';

-- Boris' Zeile mit seinem Dienstleister und Portal verknüpfen.
-- Fehlt die Zeile noch (Portal nie geöffnet), wird sie angelegt — die
-- Erinnerung selbst bleibt aus, bis Boris sie im Portal einschaltet.
insert into public.notification_preferences (user_name)
select 'Boris'
where not exists (
  select 1 from public.notification_preferences where user_name = 'Boris'
);

update public.notification_preferences
set provider_id = '193a013f-45ed-4621-b95f-b449aa79c2c9',
    portal_url  = 'https://boris-clean-hub-selfhosted.vercel.app'
where user_name = 'Boris';


-- -----------------------------------------------------------------------------
-- 2. Versandprotokoll (Doppelversand-Schutz)
-- -----------------------------------------------------------------------------

create table if not exists public.reinigung_erinnerung_log (
  id uuid primary key default gen_random_uuid(),
  service_task_id uuid not null references public.service_tasks(id) on delete cascade,
  scheduled_date date not null,
  provider_id uuid references public.service_providers(id),
  empfaenger text not null,
  gesendet_am timestamptz not null default now(),
  unique (service_task_id, scheduled_date)
);

comment on table public.reinigung_erinnerung_log is
  'Welche Reinigung wurde wann an wen per E-Mail erinnert. Schreibt nur die Edge Function reinigung-erinnerung.';

alter table public.reinigung_erinnerung_log enable row level security;

drop policy if exists "Lesen fuer angemeldete Nutzer" on public.reinigung_erinnerung_log;
create policy "Lesen fuer angemeldete Nutzer" on public.reinigung_erinnerung_log
  for select to authenticated using (true);

-- GRANTs sind Pflicht für neue Tabellen (PROJEKT-REGELN, ab 30.10.2026).
-- anon bewusst NICHT: enthält E-Mail-Adressen.
grant select on public.reinigung_erinnerung_log to authenticated;
grant select, insert, update, delete on public.reinigung_erinnerung_log to service_role;


-- -----------------------------------------------------------------------------
-- 3. Ablauf-Definition in max_ablaeufe
-- -----------------------------------------------------------------------------

INSERT INTO public.max_ablaeufe
  (aktion, aktion_label, ausloeser, variante, schritt_nr, akteur, schritt,
   ergebnis_status, umsetzung, funktion, notiz)
VALUES
  ('reinigung_erinnerung_email', 'E-Mail-Erinnerung an Reinigungen',
   'Cron stündlich', 'automatik', 1, 'max',
   'Prüft je Dienstleister mit eingeschalteter Erinnerung, ob jetzt (deutsche Zeit) seine gewählte Stunde ist, und sucht seine Reinigungen am Zieltag (heute + gewählte Tage vorher)',
   NULL, 'umgesetzt',
   'Edge Function reinigung-erinnerung',
   'Einstellung stellt der Dienstleister selbst im Portal ein (notification_preferences). Stornierte und erledigte Reinigungen sowie Reinigungen stornierter Buchungen werden übersprungen.'),

  ('reinigung_erinnerung_email', 'E-Mail-Erinnerung an Reinigungen',
   NULL, 'automatik', 2, 'max',
   'Schickt EINE Mail mit allen Reinigungen des Zieltags (Haus, Uhrzeit, Anreise, Gäste, Wäschestand) und vermerkt jede Reinigung im Versandprotokoll',
   'abgeschlossen', 'umgesetzt',
   'Edge Function reinigung-erinnerung -> Edge Function send-guest-email',
   'Doppelversand-Schutz: reinigung_erinnerung_log, eindeutig je Reinigung und Datum. Verschobene Reinigung = neues Datum = neue Erinnerung.')
ON CONFLICT DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Cron: stündlich zur Minute 5
-- -----------------------------------------------------------------------------
--
-- Stündlich, weil jeder Dienstleister seine Uhrzeit selbst wählt. Die Funktion
-- entscheidet selbst, wer gerade dran ist; außerhalb der gewählten Stunde tut
-- sie nichts. dry_run=false ist nötig — ohne ihn simuliert die Funktion nur.

select cron.unschedule('reinigung-erinnerung-hourly')
where exists (select 1 from cron.job where jobname = 'reinigung-erinnerung-hourly');

select cron.schedule(
  'reinigung-erinnerung-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/reinigung-erinnerung',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI'
    ),
    body := '{"dry_run": false}'::jsonb
  );
  $$
);


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select user_name, provider_id, email_address, email_reminder_enabled,
--          email_reminder_days_before, email_reminder_hour, portal_url
--   from public.notification_preferences where user_name = 'Boris';
--
--   select jobname, schedule, active from cron.job
--   where jobname = 'reinigung-erinnerung-hourly';
--
--   select * from public.reinigung_erinnerung_log order by gesendet_am desc limit 20;
--
-- Testlauf (sendet nichts, zeigt was gesendet würde, unabhängig von der Uhrzeit):
--   Edge Function reinigung-erinnerung mit Body {"dry_run": true, "ignore_hour": true}

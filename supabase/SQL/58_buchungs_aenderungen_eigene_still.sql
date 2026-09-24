-- =============================================================================
-- 58_buchungs_aenderungen_eigene_still.sql
-- Eigene Eingaben von Uli nicht mehr als "Neue Änderung" melden
-- =============================================================================
--
-- WARUM (24.09.2026):
-- Uli legte im Buchungsformular die Belvilla-Buchung "Jeroen De vos"
-- (Wald Chalet, 20.–27.03.2027) an. Zwei Minuten später kam eine Mail
-- "Kalender-Abgleich hat Unterschiede … gefunden: 1 neue Änderung bei den
-- Buchungen". Das System meldete ihm also, was er gerade selbst getan hatte.
--
-- Ursache: Der Trigger aus SQL 56 (log_buchungs_aenderung) protokolliert JEDE
-- neue/verschobene/stornierte Buchung — ohne zu unterscheiden, wer sie
-- angelegt hat. Gedacht war er für Buchungen, die Uli NICHT selbst eingibt
-- (Anlass 22.09.2026: Zeiser, Kwoka).
--
-- REGEL AB JETZT:
--   Kommt die Änderung von einem eingeloggten Admin (Hausverwaltungs-
--   Oberfläche: Formular, Buchungskarte, Anfrage annehmen, Gäste-Import im
--   Browser), wird sie WEITERHIN protokolliert, aber sofort als gesehen und
--   gemailt markiert -> kein Banner, keine Mail, keine Morgen-Übersicht.
--   Alles andere (Max/chat-assistant, import-guest-list, sonstige Edge
--   Functions) läuft mit dem service_role-Key; dort ist auth.uid() NULL
--   -> wird wie bisher gemeldet.
--
-- Belegt am Code (24.09.2026):
--   chat-assistant/index.ts      createClient(url, SERVICE_ROLE_KEY)  -> meldet
--   import-guest-list/index.ts   createClient(url, SERVICE_ROLE_KEY)  -> meldet
--   CreateBookingForm / useBookings / useBookingInquiries: Browser-Client mit
--   Uli-Login -> auth.uid() = Uli -> still.
--
-- Die Portal-Seite (quelle = 'portal', geschrieben von ical-sync) ist davon
-- NICHT betroffen. Eine neue Belegung in Booking.com/Airbnb wird weiter
-- gemeldet, auch wenn Uli die Buchung danach selbst nachträgt.
--
-- Ersetzt die Funktion aus 56_buchungs_aenderungen.sql vollständig
-- (CREATE OR REPLACE). Der Trigger selbst bleibt unverändert.
-- Idempotent: mehrfaches Ausführen ist unschädlich.
-- =============================================================================

create or replace function public.log_buchungs_aenderung()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gast   text;
  v_von    date;
  v_bis    date;
  v_alt    text;
  v_plat   text;
  v_status text;
  v_status_alt text;
  -- NEU 58: Zeitstempel für "gesehen"/"gemailt", wenn Uli selbst geändert hat.
  -- auth.uid() liest den JWT der Anfrage und ist von SECURITY DEFINER nicht
  -- betroffen. Bei service_role (Edge Functions) ist er NULL.
  v_quittiert timestamptz;
begin
  -- Vergangene Buchungen sind kein Hinweis wert (unverändert aus 56).
  if new.check_out is null or new.check_out < now() then
    return new;
  end if;

  if auth.uid() is not null and public.has_role(auth.uid(), 'admin'::app_role) then
    v_quittiert := now();
  else
    v_quittiert := null;
  end if;

  v_status     := coalesce(new.status::text, '');
  v_status_alt := case when tg_op = 'UPDATE' then coalesce(old.status::text, '') else '' end;

  select g.name into v_gast from public.guests g where g.id = new.guest_id;
  v_gast := coalesce(nullif(trim(v_gast), ''), 'ohne Namen');
  v_von  := (new.check_in  at time zone 'Europe/Berlin')::date;
  v_bis  := (new.check_out at time zone 'Europe/Berlin')::date;
  v_plat := coalesce(nullif(new.platform, ''), 'direkt');

  if tg_op = 'INSERT' then
    if v_status = 'cancelled' then
      return new;
    end if;
    insert into public.buchungs_aenderungen
      (house_id, quelle, art, platform, booking_id, von, bis, text, gesehen_am, gemailt_am)
    values
      (new.house_id, 'hausverwaltung', 'neu', v_plat, new.id, v_von, v_bis,
       format('Neue Buchung „%s" (%s): %s–%s', v_gast, v_plat,
              to_char(v_von, 'DD.MM.YYYY'), to_char(v_bis, 'DD.MM.YYYY')),
       v_quittiert, v_quittiert);
    return new;
  end if;

  -- UPDATE: Stornierung
  if v_status = 'cancelled' and v_status_alt <> 'cancelled' then
    insert into public.buchungs_aenderungen
      (house_id, quelle, art, platform, booking_id, von, bis, text, gesehen_am, gemailt_am)
    values
      (new.house_id, 'hausverwaltung', 'storniert', v_plat, new.id, v_von, v_bis,
       format('Buchung „%s" (%s) storniert: %s–%s', v_gast, v_plat,
              to_char(v_von, 'DD.MM.YYYY'), to_char(v_bis, 'DD.MM.YYYY')),
       v_quittiert, v_quittiert);
    return new;
  end if;

  -- UPDATE: Zeitraum verschoben (nur bei nicht stornierten Buchungen)
  if v_status <> 'cancelled'
     and ((new.check_in  at time zone 'Europe/Berlin')::date is distinct from (old.check_in  at time zone 'Europe/Berlin')::date
       or (new.check_out at time zone 'Europe/Berlin')::date is distinct from (old.check_out at time zone 'Europe/Berlin')::date)
  then
    v_alt := to_char((old.check_in at time zone 'Europe/Berlin')::date, 'DD.MM.YYYY') || '–' ||
             to_char((old.check_out at time zone 'Europe/Berlin')::date, 'DD.MM.YYYY');
    insert into public.buchungs_aenderungen
      (house_id, quelle, art, platform, booking_id, von, bis, text, gesehen_am, gemailt_am)
    values
      (new.house_id, 'hausverwaltung', 'geaendert', v_plat, new.id, v_von, v_bis,
       format('Buchung „%s" (%s) verschoben: %s → %s–%s', v_gast, v_plat, v_alt,
              to_char(v_von, 'DD.MM.YYYY'), to_char(v_bis, 'DD.MM.YYYY')),
       v_quittiert, v_quittiert);
  end if;

  return new;

-- Ein Hinweis darf NIE eine Buchung verhindern (unverändert aus 56).
exception when others then
  raise warning 'log_buchungs_aenderung: % (Buchung %)', sqlerrm, new.id;
  return new;
end;
$$;


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
-- 1. Funktion ist die neue Fassung (muss 'v_quittiert' enthalten):
--
--   select position('v_quittiert' in pg_get_functiondef('public.log_buchungs_aenderung'::regproc)) > 0 as ist_neu;
--
-- 2. Nach der nächsten Buchung, die Uli selbst im Formular anlegt:
--
--   select a.text, a.erkannt_am, a.gesehen_am, a.gemailt_am
--   from public.buchungs_aenderungen a
--   order by a.erkannt_am desc limit 5;
--
-- Erwartet: gesehen_am und gemailt_am sind gesetzt (gleich erkannt_am).
-- Bei einer Buchung über Max ("Anfrage annehmen") bleiben beide leer.

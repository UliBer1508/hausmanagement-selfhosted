-- =============================================================================
-- 36_direktbuchung_portale_geprueft.sql
-- Erinnerung: Direktbuchungen in den Portalen prüfen
-- Angelegt: 19.07.2026
-- =============================================================================
--
-- ZWECK
-- -----
-- Direktbuchungen gehen über `ical-export` an Airbnb, Booking.com und VRBO.
-- Die Portale importieren sie und blocken den Zeitraum — geben ihn aber NICHT
-- über ihren eigenen Export zurück (jedes Portal exportiert nur seine eigenen
-- Buchungen, dieselbe Regel wie unser Export).
--
-- FOLGE: Ob eine Direktbuchung in den Portalen tatsächlich angekommen ist,
-- lässt sich über iCal NICHT feststellen. Belegt am 19.07.2026: Die
-- Direktbuchung "Luca" (16.-23.08.2026) war in allen drei Portal-Kalendern
-- sichtbar geblockt, tauchte aber in keinem einzigen Portal-Feed auf.
--
-- Deshalb kein automatischer Abgleich, sondern eine Erinnerung mit Quittung:
-- Uli prüft in den Portalen und hakt in der Buchungskarte ab.
--
-- ZWEI RICHTUNGEN, beide wichtig:
--   1. Neue Direktbuchung  -> Zeitraum muss in den Portalen GEBLOCKT sein,
--                             sonst droht eine Doppelbuchung.
--   2. Storniert           -> Blockade muss ZURÜCKGENOMMEN werden, sonst
--                             bleibt der Zeitraum unverkäuflich (entgangener
--                             Umsatz — vgl. die 183-Nächte-Sperre vom 18.07.).
--
-- Ausführen im Supabase SQL-Editor (NICHT per CLI/db push — Repo-Regel).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Neue Spalten auf bookings
-- -----------------------------------------------------------------------------

alter table public.bookings
  add column if not exists portale_geprueft_am timestamptz,
  add column if not exists portale_geprueft_von text,
  -- Merkt, wofür quittiert wurde: 'blockiert' (Buchung aktiv) oder
  -- 'freigegeben' (nach Storno). Ohne diese Unterscheidung wüsste das System
  -- nach einem Storno nicht, ob das Häkchen noch die alte Blockade betrifft.
  add column if not exists portale_geprueft_art text;

comment on column public.bookings.portale_geprueft_am is
  'Wann Uli bestätigt hat, dass der Zeitraum in den Portalen korrekt gesetzt ist. Nur für Direktbuchungen relevant.';
comment on column public.bookings.portale_geprueft_art is
  'blockiert = Zeitraum ist in den Portalen gesperrt; freigegeben = nach Storno wieder freigegeben.';


-- -----------------------------------------------------------------------------
-- 2. Häkchen bei Statuswechsel zurücksetzen
-- -----------------------------------------------------------------------------
--
-- WARUM EIN TRIGGER: Wird eine Direktbuchung storniert, ist die alte Quittung
-- ("in den Portalen geblockt") wertlos — jetzt muss die Blockade ZURÜCKGENOMMEN
-- werden. Dasselbe umgekehrt, falls eine Stornierung rückgängig gemacht wird.
--
-- Ohne dieses Zurücksetzen bliebe das Häkchen stehen und die Erinnerung käme
-- nie — der Zeitraum bliebe für immer blockiert.
--
-- Auch bei einer Datumsänderung wird zurückgesetzt: Ein verschobener Zeitraum
-- ist in den Portalen ein anderer Zeitraum.

create or replace function public.reset_portale_geprueft()
returns trigger
language plpgsql
as $$
begin
  -- Nur Direktbuchungen betreffen die Portal-Prüfung.
  -- Liste identisch mit BookingCard.tsx und kalender-abgleich/index.ts:
  -- alles, was kein eindeutiges Portal ist. 'other' und 'unknown' sind bewusst
  -- dabei — lieber einmal zu viel erinnert, als eine Direktbuchung übersehen.
  -- (ical-export nutzt einen ENGEREN Filter: nur null/direct/website.)
  if coalesce(new.platform, 'direct') not in ('direct', 'website', 'other', 'unknown', '') then
    return new;
  end if;

  if (new.status is distinct from old.status)
     or (new.check_in  is distinct from old.check_in)
     or (new.check_out is distinct from old.check_out)
  then
    new.portale_geprueft_am  := null;
    new.portale_geprueft_von := null;
    new.portale_geprueft_art := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reset_portale_geprueft on public.bookings;
create trigger trg_reset_portale_geprueft
  before update on public.bookings
  for each row
  execute function public.reset_portale_geprueft();


-- -----------------------------------------------------------------------------
-- 3. Einstellung: Karenzzeit
-- -----------------------------------------------------------------------------
--
-- Die Erinnerung kommt NICHT sofort: Die Portale rufen den Feed alle 30 Minuten
-- bis wenige Stunden ab. Vorher würde Uli vergeblich nachsehen.
-- 24 Stunden sind großzügig genug für alle drei Portale.

update public.system_settings
set value = value || jsonb_build_object('direktbuchung_karenz_stunden', 24)
where key = 'kalender_abgleich_settings'
  and not (value ? 'direktbuchung_karenz_stunden');


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'bookings' and column_name like 'portale%';
--
--   select tgname from pg_trigger where tgname = 'trg_reset_portale_geprueft';
--
--   select value from public.system_settings where key = 'kalender_abgleich_settings';
--
-- Offene Direktbuchungen (sollten nach dem Einspielen alle ungeprüft sein):
--   select guest_name, platform, check_in::date, check_out::date, status,
--          portale_geprueft_am
--   from public.bookings
--   where coalesce(platform, 'direct') in ('direct','website','other','unknown','')
--     and check_out >= current_date
--   order by check_in;
-- =============================================================================

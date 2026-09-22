-- =============================================================================
-- 57_pruefe_belegung.sql
-- EINE Belegungsprüfung für alle Wege, auf denen eine Buchung entsteht
-- =============================================================================
--
-- WARUM (22.09.2026):
-- Bisher prüfte nur das Buchungsformular (CreateBookingForm) — und nur gegen
-- EIGENE Buchungen. Max ("Anfrage annehmen", accept_booking_inquiry) prüfte gar
-- nicht; er konnte sogar eine Überschneidung mit einer eigenen Buchung anlegen.
-- Gegen die Portale (external_blocks aus ical-sync) prüfte niemand.
--
-- Diese Funktion ist die EINE Regel. Formular und Max rufen sie auf. Vorher
-- stoßen beide ical-sync für das Haus an, damit die Portal-Daten frisch sind.
--
-- REGELN (tagesgenau, wie kalender-abgleich):
--   Überschneidung = von_a < bis_b UND bis_a > von_b (Abreisetag exklusiv).
--   Abreise und Anreise am selben Tag ist KEINE Überschneidung.
--   Datum der Buchungen in Europe/Berlin (check_in/check_out sind timestamptz).
--
-- ERGEBNIS je Treffer (art):
--   'eigene_buchung' — nicht stornierte Buchung im System  → Speichern sperren
--   'portal_belegt'  — ANDERES Portal meldet belegt        → Warnung, "Trotzdem"
--   'portal_sperre'  — anderes Portal, Block kürzer als min_naechte
--                      (Mindestaufenthalts-Sperre)          → Hinweis, "Trotzdem"
--   'passt'          — DASSELBE Portal meldet diesen Zeitraum
--                      (normaler Fall beim Nachtragen einer Portal-Buchung)
--
-- Portal-Blocks, deren überlappende Tage vollständig durch EIGENE Buchungen
-- gedeckt sind, zählen nicht als eigener Treffer: Das ist dieselbe Belegung,
-- und die eigene Buchung erscheint schon als 'eigene_buchung'.
--
-- SECURITY INVOKER (Standard): läuft mit den Rechten des Aufrufers. Uli
-- (admin) und die Edge Functions (service_role) dürfen bookings,
-- external_blocks und system_settings lesen.
--
-- Rein lesend. Idempotent.
-- =============================================================================

create or replace function public.pruefe_belegung(
  p_house_id          uuid,
  p_von               date,
  p_bis               date,
  p_ausser_booking_id uuid default null,
  p_platform          text default null
)
returns table (
  art      text,
  platform text,
  von      date,
  bis      date,
  gast     text,
  text     text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_min int;
begin
  select coalesce((value->>'min_naechte')::int, 4) into v_min
  from system_settings where key = 'kalender_abgleich_settings';
  v_min := coalesce(v_min, 4);

  -- 1. Eigene Buchungen
  return query
  select 'eigene_buchung'::text,
         coalesce(nullif(b.platform, ''), 'direkt'),
         (b.check_in  at time zone 'Europe/Berlin')::date,
         (b.check_out at time zone 'Europe/Berlin')::date,
         coalesce(nullif(trim(g.name), ''), 'ohne Namen'),
         format('Überschneidung mit der Buchung „%s" (%s): %s–%s',
                coalesce(nullif(trim(g.name), ''), 'ohne Namen'),
                coalesce(nullif(b.platform, ''), 'direkt'),
                to_char((b.check_in  at time zone 'Europe/Berlin')::date, 'DD.MM.YYYY'),
                to_char((b.check_out at time zone 'Europe/Berlin')::date, 'DD.MM.YYYY'))
  from bookings b
  left join guests g on g.id = b.guest_id
  where b.house_id = p_house_id
    and coalesce(b.status::text, '') <> 'cancelled'
    and (p_ausser_booking_id is null or b.id <> p_ausser_booking_id)
    and (b.check_in  at time zone 'Europe/Berlin')::date < p_bis
    and (b.check_out at time zone 'Europe/Berlin')::date > p_von;

  -- 2. Portal-Belegungen
  return query
  with treffer as (
    select e.platform as plat, e.start_date, e.end_date,
           (e.end_date - e.start_date) as naechte,
           greatest(e.start_date, p_von) as ue_von,
           least(e.end_date, p_bis)      as ue_bis
    from external_blocks e
    where e.house_id = p_house_id
      and e.start_date < p_bis
      and e.end_date   > p_von
  ),
  mit_deckung as (
    select t.*,
      -- Anzahl überlappender Tage, die NICHT durch eigene Buchungen gedeckt sind
      (select count(*) from generate_series(t.ue_von, t.ue_bis - 1, interval '1 day') d
        where not exists (
          select 1 from bookings b
          where b.house_id = p_house_id
            and coalesce(b.status::text, '') <> 'cancelled'
            and (p_ausser_booking_id is null or b.id <> p_ausser_booking_id)
            and (b.check_in  at time zone 'Europe/Berlin')::date <= d::date
            and (b.check_out at time zone 'Europe/Berlin')::date >  d::date
        )) as offen
    from treffer t
  )
  select
    case
      when p_platform is not null and m.plat = p_platform then 'passt'
      when m.naechte < v_min then 'portal_sperre'
      else 'portal_belegt'
    end,
    m.plat,
    m.start_date,
    m.end_date,
    null::text,
    case
      when p_platform is not null and m.plat = p_platform then
        format('Passt: %s meldet %s–%s als belegt', m.plat,
               to_char(m.start_date, 'DD.MM.YYYY'), to_char(m.end_date, 'DD.MM.YYYY'))
      when m.naechte < v_min then
        format('%s sperrt %s–%s (%s Nächte, vermutlich Mindestaufenthalts-Sperre)', m.plat,
               to_char(m.start_date, 'DD.MM.YYYY'), to_char(m.end_date, 'DD.MM.YYYY'), m.naechte)
      else
        format('%s meldet %s–%s als belegt — dort gibt es vermutlich schon eine Buchung', m.plat,
               to_char(m.start_date, 'DD.MM.YYYY'), to_char(m.end_date, 'DD.MM.YYYY'))
    end
  from mit_deckung m
  where (p_platform is not null and m.plat = p_platform)  -- 'passt' immer zeigen
     or m.offen > 0;                                      -- sonst nur Ungedecktes
end;
$$;

grant execute on function public.pruefe_belegung(uuid, date, date, uuid, text) to authenticated, service_role;

comment on function public.pruefe_belegung(uuid, date, date, uuid, text) is
  'Belegungsprüfung (eigene Buchungen + Portal-Blocks) für Formular und Max. Siehe SQL 57.';


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN (nur lesend)
-- =============================================================================
-- Beispiel Venediger Chalet, Zeitraum der Buchung Zeiser, als Direktbuchung:
--   select * from public.pruefe_belegung(
--     (select id from houses where name ilike 'Venediger%'),
--     '2026-12-29', '2027-01-03', null, 'direct');
-- Erwartet: 'eigene_buchung' (Julia Zeiser). Den Booking.com-Block meldet sie
-- NICHT zusätzlich, weil er durch Kerscher + Zeiser gedeckt ist.

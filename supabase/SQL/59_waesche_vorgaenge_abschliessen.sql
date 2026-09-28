-- =============================================================================
-- 59_waesche_vorgaenge_abschliessen.sql
-- Wäsche-Vorgänge in "Max: Aktionen" schließen, statt sie ewig offen zu lassen
-- Stand 28.09.2026
-- =============================================================================
--
-- Ausführung im Supabase-SQL-Editor, Teil für Teil. NICHT `supabase db push`
-- (Migrations-Historie ist seit Lovable desynchron, siehe README.md).
--
-- WARUM
--
-- Im Fenster "Max: Aktionen" standen am 28.09.2026 Wäsche-Vorgänge seit Wochen
-- auf "Wartet auf dich", obwohl nichts mehr zu tun war. Zwei Ursachen:
--
-- 1. "Wäsche angepasst" (update_linen_for_booking) wartete auf Teuni.
--    Nichts hat den Vorgang je geschlossen: Der einzige Schließ-Trigger
--    reagiert auf offen -> ausstehend, und die Anpassung ändert den Status
--    bewusst NICHT. Teuni war aber längst informiert — über den Pflichtdialog
--    im Portal (Trigger notify_booking_guest_count_change ->
--    booking_change_notifications). Bei Tal Yehuda hat sie alle 7 Änderungen
--    quittiert (01.09.–11.09.2026). Seit 28.09.2026 zeigt ihr außerdem die
--    Buchungskarte dauerhaft "Wäsche von 6 auf 7 Gäste angepasst".
--
--    Uli-Entscheidung 28.09.2026: Der Vorgang INFORMIERT nur. Er wird ab jetzt
--    gleich als "abgeschlossen" angelegt (CreateBookingForm.tsx,
--    chat-assistant). Dieses Skript passt die Ablauf-Beschreibung an und
--    schließt die Altfälle.
--
-- 2. "Wäsche automatisch angelegt" (auto_linen_created, aus
--    auto-create-linen-orders) wurde NIE geschlossen: Der Schließ-Trigger
--    close_max_action_on_linen_confirmed kannte diesen Typ nicht — sein
--    Filter umfasste nur create_linen_for_booking, update_linen_for_booking
--    und reschedule_linen_delivery. Beispiel: Tal Yehuda, angelegt 11.08.2026,
--    längst geliefert, Vorgang offen.
--
-- Keine neue Tabelle -> keine GRANTs nötig (Regel ab 30.10.2026 greift nicht).
-- =============================================================================


-- =============================================================================
-- TEIL 0 — VORHER PRÜFEN (nur lesen)
-- =============================================================================
-- Einige Trigger liegen nur in der Datenbank. Bevor Teil A die Funktion
-- ersetzt: Stimmt die LIVE-Fassung mit 22_max_reschedule_linen_triggers.sql
-- überein? Erwartet: action_type-Filter mit genau den drei Typen
-- create_linen_for_booking, update_linen_for_booking, reschedule_linen_delivery
-- und KEIN weiterer Code. Weicht sie ab: NICHT weitermachen, Ausgabe an Claude.

select pg_get_functiondef('public.close_max_action_on_linen_confirmed'::regproc);


-- =============================================================================
-- TEIL A — Schließ-Trigger kennt auto_linen_created. Idempotent.
-- =============================================================================
-- Gegenüber 22_... NUR eine Änderung: 'auto_linen_created' im Filter.

CREATE OR REPLACE FUNCTION public.close_max_action_on_linen_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nur beim Uebergang offen -> ausstehend (= Bestaetigung durch Uli)
  IF NOT (OLD.status = 'offen' AND NEW.status = 'ausstehend') THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS NULL THEN
    RETURN NEW;   -- Ausnahmebestellung ohne Buchung -> kein Max-Vorgang
  END IF;

  UPDATE public.max_actions
  SET status      = 'abgeschlossen',
      last_step   = COALESCE(NULLIF(last_step, ''), '') ||
                    CASE WHEN COALESCE(NULLIF(last_step, ''), '') = '' THEN '' ELSE ' -> ' END ||
                    'Uli hat auf "ausstehend" gesetzt',
      waiting_for = NULL,
      due_at      = NULL,
      updated_at  = now()
  WHERE status = 'wartet_uli'
    AND action_type IN ('create_linen_for_booking', 'update_linen_for_booking',
                        'reschedule_linen_delivery',
                        'auto_linen_created')          -- NEU 28.09.2026
    AND (
          booking_id = NEW.booking_id                              -- Normalfall
          OR (booking_id IS NULL                                    -- Altlast:
              AND details->>'booking_id' = NEW.booking_id::text)    -- nur im JSON
        );

  RETURN NEW;
END;
$function$;

-- Der Trigger selbst bleibt unverändert (trg_close_max_action_on_linen_confirmed,
-- AFTER UPDATE ON linen_orders) — CREATE OR REPLACE tauscht nur die Funktion.


-- =============================================================================
-- TEIL B — Ablauf-Beschreibung "Wäsche angepasst" (reine Doku-Tabelle,
--          steuert Max NICHT; angezeigt in "Max: Abläufe (Kontrolle)").
-- =============================================================================

UPDATE public.max_ablaeufe
SET ergebnis_status = 'abgeschlossen',
    notiz           = 'Seit 28.09.2026: Vorgang wird sofort als abgeschlossen angelegt (nur Information, kein Warten auf Teuni).',
    updated_at      = now()
WHERE aktion = 'update_linen_for_booking' AND variante = 'standard' AND schritt_nr = 2;

UPDATE public.max_ablaeufe
SET akteur          = 'system',
    schritt         = 'Teuni wird automatisch informiert (Pflichtdialog im Portal + Hinweis auf der Buchungskarte)',
    ergebnis_status = 'abgeschlossen',
    funktion        = 'DB-Trigger notify_booking_guest_count_change -> booking_change_notifications (Dialog, Teuni quittiert); Teuni-Portal BookingCard: Mengenabgleich-Badge. Keine Nachricht von Max.',
    weg             = 'system',
    umsetzung       = 'umgesetzt',
    notiz           = 'Uli-Entscheidung 28.09.2026: nur informieren. Vorher: Max sollte per send_provider_message informieren — Vorgang blieb dadurch offen.',
    updated_at      = now()
WHERE aktion = 'update_linen_for_booking' AND variante = 'standard' AND schritt_nr = 4;


-- =============================================================================
-- TEIL C — Altfälle schließen. Erst VORSCHAU, dann UPDATE.
-- =============================================================================
-- Es wird nichts gelöscht. Jeder Vorgang bekommt einen Verlaufs-Eintrag, der
-- sagt, warum er nachträglich geschlossen wurde.

-- C1 VORSCHAU: "Wäsche angepasst", wartet auf Teuni
select id, created_at, guest_name, last_step
from public.max_actions
where action_type = 'update_linen_for_booking'
  and status = 'wartet_uli'
  and waiting_for = 'teuni'
order by created_at;

-- C2 VORSCHAU: Wäsche-Vorgänge, die auf Uli warten, deren Bestellung aber
--              nicht mehr "offen" ist (bestätigt, geliefert). Vorgänge mit
--              noch offener Bestellung (z. B. Felix Sommer, Lieferung 2027)
--              bleiben zu Recht stehen und erscheinen hier nicht.
select a.id, a.action_type, a.created_at, a.guest_name,
       string_agg(distinct lo.status, ', ') as bestellstatus
from public.max_actions a
join public.linen_orders lo on lo.booking_id = a.booking_id
where a.action_type in ('auto_linen_created', 'create_linen_for_booking', 'update_linen_for_booking')
  and a.status = 'wartet_uli'
  and a.waiting_for = 'uli'
  and lo.status <> 'cancelled'
group by a.id, a.action_type, a.created_at, a.guest_name
having bool_and(lo.status <> 'offen')
order by a.created_at;


-- Wenn die Vorschau passt: C1 und C2 ausführen.
begin;

-- C1
update public.max_actions
set status      = 'abgeschlossen',
    waiting_for = null,
    due_at      = null,
    last_step   = coalesce(nullif(last_step, ''), '') || ' -> Nachträglich geschlossen: Teuni wird automatisch im Portal informiert',
    details     = jsonb_set(
                    coalesce(details, '{}'::jsonb), '{verlauf}',
                    coalesce(details->'verlauf', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                      'schritt',   'Nachträglich geschlossen (SQL 59): Teuni wird automatisch im Portal informiert (Dialog + Buchungskarte)',
                      'zeitpunkt', now(),
                      'akteur',    'system'))),
    updated_at  = now()
where action_type = 'update_linen_for_booking'
  and status = 'wartet_uli'
  and waiting_for = 'teuni';

-- C2
update public.max_actions a
set status      = 'abgeschlossen',
    waiting_for = null,
    due_at      = null,
    last_step   = coalesce(nullif(a.last_step, ''), '') || ' -> Nachträglich geschlossen: Bestellung ist nicht mehr offen',
    details     = jsonb_set(
                    coalesce(a.details, '{}'::jsonb), '{verlauf}',
                    coalesce(a.details->'verlauf', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                      'schritt',   'Nachträglich geschlossen (SQL 59): Bestellung ist bereits bestätigt oder geliefert',
                      'zeitpunkt', now(),
                      'akteur',    'system'))),
    updated_at  = now()
where a.action_type in ('auto_linen_created', 'create_linen_for_booking', 'update_linen_for_booking')
  and a.status = 'wartet_uli'
  and a.waiting_for = 'uli'
  and exists (select 1 from public.linen_orders lo
              where lo.booking_id = a.booking_id and lo.status <> 'cancelled')
  and not exists (select 1 from public.linen_orders lo
                  where lo.booking_id = a.booking_id and lo.status = 'offen');

commit;


-- =============================================================================
-- KONTROLLE
-- =============================================================================
-- 1. Filter enthält auto_linen_created?
--    select pg_get_functiondef('public.close_max_action_on_linen_confirmed'::regproc);
-- 2. Keine "Wäsche angepasst" mehr, die auf Teuni wartet (Erwartung: 0):
--    select count(*) from public.max_actions
--    where action_type = 'update_linen_for_booking' and status = 'wartet_uli';
-- 3. Ablauf-Schritt 4:
--    select schritt_nr, akteur, schritt, weg from public.max_ablaeufe
--    where aktion = 'update_linen_for_booking' order by schritt_nr;
-- =============================================================================

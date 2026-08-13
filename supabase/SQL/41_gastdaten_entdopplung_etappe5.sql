-- =============================================================================
-- 41_gastdaten_entdopplung_etappe5.sql
--
-- ETAPPE 5 aus docs/Konzept-Gastdaten-Entdopplung.md:
-- Die Schreibpfade werden autark. Gastdaten entstehen ab jetzt DIREKT in
-- `guests`; die Buchung traegt nur noch den Verweis.
--
-- AUSGANGSLAGE (geprueft am 13.08.2026 im Code):
--   Vier Wege legen Buchungen an. Zwei setzen `guest_id` selbst, zwei nicht:
--
--     CreateBookingForm.tsx      setzt guest_id   ✓
--     useBookingInquiries.ts     setzt guest_id   ✓
--     import-guest-list          setzt guest_id   ✗
--     chat-assistant             setzt guest_id   ✗
--
--   Bei den letzten beiden wandern die Gastdaten weiterhin in die
--   Kopiespalten, und erst der Trigger link_guest_on_booking_insert legt
--   daraus den Gast an. Das Ergebnis stimmt — aber der Weg fuehrt durch die
--   Buchungstabelle als Durchgangsstation. Genau die soll verschwinden.
--
-- WAS DIESES SKRIPT TUT:
--   Es loest die sechsstufige Zuordnungs-Kaskade aus dem Trigger heraus und
--   macht sie als Funktion `find_or_create_guest(...)` aufrufbar. Danach gibt
--   es EINE Stelle, die entscheidet, welcher Gast gemeint ist:
--
--     link_guest_on_booking_insert()  ruft sie auf  (Altpfade, unveraendert)
--     chat-assistant                  ruft sie per RPC auf
--     import-guest-list               ruft sie per RPC auf
--     spaeter: CreateBookingForm      kann seine eigene Kaskade ablegen
--
--   Die Alternative waere, die Kaskade in jede Funktion zu kopieren. Das waere
--   die vierte Kopie derselben Entscheidung und verstoesst gegen die
--   Doppelgaenger-Regel (PROJEKT-REGELN, CODE-INDEX Abschnitt 3).
--
-- VERHALTEN AENDERT SICH NICHT. Die Kaskade wird wortgleich uebernommen,
-- inklusive der sechsten Stufe (E-Mail allein) und der Regel „bei bestehendem
-- Gast nur Luecken fuellen, nie ueberschreiben".
--
-- IDEMPOTENT: mehrfaches Ausfuehren ist unschaedlich.
-- AUSFUEHREN: Supabase Dashboard -> SQL Editor. NICHT per db push.
-- REIHENFOLGE: nach 40_gastdaten_entdopplung_etappe3.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Die Zuordnungs-Kaskade als eigenstaendige Funktion
-- -----------------------------------------------------------------------------
--
-- Findet den passenden Gast oder legt ihn an und gibt seine id zurueck.
--
-- ALLE Parameter ausser p_name sind optional. Ohne Namen ist keine Zuordnung
-- moeglich — dann kommt NULL zurueck, und der Aufrufer entscheidet, was das
-- bedeutet (der Trigger laesst die Buchung dann ohne guest_id durch, wie
-- bisher).
--
-- SECURITY DEFINER, damit der Aufruf per RPC aus Edge Functions auch dann
-- greift, wenn spaeter RLS auf `guests` aktiviert wird. Der `search_path` wird
-- fest verdrahtet — ohne das koennte ein Aufrufer mit eigenem search_path die
-- Funktion auf andere Tabellen umlenken.

create or replace function public.find_or_create_guest(
  p_name            text,
  p_email           text default null,
  p_phone           text default null,
  p_street          text default null,
  p_city            text default null,
  p_postal_code     text default null,
  p_birth_date      date default null,
  p_travel_document text default null,
  p_nationality     text default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  found_guest_id uuid;
begin
  -- Ohne Namen ist keine Zuordnung moeglich.
  if p_name is null or trim(p_name) = '' then
    return null;
  end if;

  -- PRIORITAET 1: Name + E-Mail
  if p_email is not null and p_email <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(name))  = lower(trim(p_name))
      and lower(trim(email)) = lower(trim(p_email))
    limit 1;
  end if;

  -- PRIORITAET 2: Name + Telefonnummer (normalisiert)
  if found_guest_id is null and p_phone is not null and p_phone <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(name)) = lower(trim(p_name))
      and replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') =
          replace(replace(replace(p_phone, ' ', ''), '-', ''), '+', '')
    limit 1;
  end if;

  -- PRIORITAET 3: Name + Nationalitaet + Stadt
  if found_guest_id is null
     and p_nationality is not null
     and p_city is not null and p_city <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(name))  = lower(trim(p_name))
      and upper(nationality) = upper(p_nationality)
      and lower(trim(city))  = lower(trim(p_city))
    limit 1;
  end if;

  -- PRIORITAET 4: Name + Geburtsdatum
  if found_guest_id is null and p_birth_date is not null then
    select id into found_guest_id
    from public.guests
    where lower(trim(name)) = lower(trim(p_name))
      and birth_date = p_birth_date
    limit 1;
  end if;

  -- PRIORITAET 5: Name + seltene Nationalitaet (nicht DACH).
  -- Bei DE/AT/CH waere der Name allein zu unspezifisch — "Bernd Wagner" und
  -- "Enrico Wagner" sind zwei verschiedene Personen im echten Bestand.
  if found_guest_id is null
     and p_nationality is not null
     and upper(p_nationality) not in ('DE', 'AT', 'CH') then
    select id into found_guest_id
    from public.guests
    where lower(trim(name))  = lower(trim(p_name))
      and upper(nationality) = upper(p_nationality)
    order by
      case when email is not null and email <> '' then 0 else 1 end,
      created_at desc
    limit 1;
  end if;

  -- PRIORITAET 6: E-Mail allein — ZWINGEND, nicht optional.
  --
  -- Auf guests liegt ein UNIQUE INDEX `guests_email_unique` (partiell, auf
  -- email <> ''). Ohne diese Stufe wuerde eine Buchung mit bekannter E-Mail,
  -- aber abweichender Namensschreibweise ("C. Mueller" statt "Christian
  -- Mueller") durch alle Stufen fallen und einen INSERT mit derselben E-Mail
  -- versuchen -> UNIQUE-Verletzung -> der GESAMTE Vorgang schlaegt fehl.
  -- Da der Index E-Mail ohnehin als eindeutig erzwingt, ist Verknuepfen die
  -- einzig konsistente Reaktion.
  if found_guest_id is null and p_email is not null and p_email <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(email)) = lower(trim(p_email))
    limit 1;
  end if;

  if found_guest_id is not null then
    -- Bestehender Gast: nur LUECKEN fuellen, nie ueberschreiben. Der Bestand in
    -- guests ist die Quelle; ein neuer Vorgang darf ihn ergaenzen, nicht
    -- korrigieren.
    update public.guests set
      email           = coalesce(nullif(p_email, ''), email),
      phone           = coalesce(p_phone,           phone),
      street          = coalesce(p_street,          street),
      city            = coalesce(p_city,            city),
      postal_code     = coalesce(p_postal_code,     postal_code),
      birth_date      = coalesce(p_birth_date,      birth_date),
      travel_document = coalesce(p_travel_document, travel_document),
      nationality     = coalesce(p_nationality,     nationality),
      notes           = coalesce(p_notes,           notes),
      updated_at      = now()
    where id = found_guest_id;

    return found_guest_id;
  end if;

  -- Kein Treffer: neu anlegen.
  insert into public.guests (
    name, email, phone, street, city, postal_code,
    birth_date, travel_document, nationality, notes
  ) values (
    trim(p_name),
    nullif(p_email, ''),
    p_phone,
    p_street,
    p_city,
    p_postal_code,
    p_birth_date,
    p_travel_document,
    p_nationality,
    p_notes
  )
  returning id into found_guest_id;

  return found_guest_id;
end;
$function$;


-- Aufruf per RPC aus den Edge Functions erlauben.
-- `service_role` genuegt fuer die Edge Functions (sie nutzen den Service-Key).
-- `authenticated` ist ergaenzt, damit spaeter auch das Buchungsformular im
-- Frontend dieselbe Funktion nutzen kann, statt seine eigene Kaskade zu pflegen.
grant execute on function public.find_or_create_guest(
  text, text, text, text, text, text, date, text, text, text
) to service_role, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Der Trigger nutzt ab jetzt dieselbe Funktion
-- -----------------------------------------------------------------------------
--
-- Der Trigger bleibt bestehen und behaelt seine Aufgabe: Er greift, wenn ein
-- Schreibpfad `guest_id` NICHT mitgibt. Nur die Kaskade steckt nicht mehr in
-- ihm drin, sondern wird aufgerufen.
--
-- WARUM DER TRIGGER BLEIBT: Er ist das Sicherheitsnetz. Solange auch nur ein
-- Weg (ein Import, ein manueller INSERT im SQL-Editor, ein kuenftiger Portal-
-- Anschluss) ohne guest_id schreibt, entsteht der Gast trotzdem. Erst wenn
-- Etappe 6 die Kopiespalten entfernt, verliert er seine Grundlage und wird
-- zusammen mit ihnen abgebaut.

create or replace function public.link_guest_on_booking_insert()
returns trigger
language plpgsql
as $function$
begin
  -- Zuordnung bereits mitgegeben: nichts zu tun.
  -- Ab Etappe 5 ist das der Regelfall — alle vier Schreibpfade setzen guest_id
  -- selbst. Der Rest dieser Funktion ist nur noch Auffangnetz.
  if new.guest_id is not null then
    return new;
  end if;

  new.guest_id := public.find_or_create_guest(
    new.guest_name,
    new.guest_email,
    new.guest_phone,
    new.guest_street,
    new.guest_city,
    new.guest_postal_code,
    new.guest_birth_date,
    new.guest_travel_document,
    new.nationality,
    new.guest_notes
  );

  return new;
end;
$function$;

-- Trigger neu binden (idempotent; Definition unveraendert gegenueber Etappe 3).
drop trigger if exists trg_link_guest_on_booking_insert on public.bookings;
create trigger trg_link_guest_on_booking_insert
  before insert on public.bookings
  for each row
  execute function public.link_guest_on_booking_insert();


-- -----------------------------------------------------------------------------
-- 3. Kontrolle nach dem Ausfuehren
-- -----------------------------------------------------------------------------
--
-- a) Existiert die Funktion und ist sie aufrufbar?
--
--    select p.proname, pg_get_function_identity_arguments(p.oid) as args
--    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'find_or_create_guest';
--
--    ERWARTET: eine Zeile mit zehn Parametern.
--
-- b) Haengt der Trigger noch?
--
--    select t.tgname, p.proname
--    from pg_trigger t
--    join pg_class c on c.oid = t.tgrelid
--    join pg_proc  p on p.oid = t.tgfoid
--    where c.relname = 'bookings' and not t.tgisinternal
--    order by t.tgname;
--
--    ERWARTET: trg_link_guest_on_booking_insert ist dabei.
--
-- c) Funktionstest OHNE Nebenwirkung — bestehenden Gast wiederfinden.
--    Setze Name und E-Mail eines Gastes ein, der sicher existiert.
--    Die Funktion DARF keinen neuen Gast anlegen, sondern muss die
--    vorhandene id zurueckgeben.
--
--    select public.find_or_create_guest('Luca Berresheim', 'luca.berresheim@hotmail.de');
--
--    Danach pruefen, dass nichts Neues entstanden ist:
--
--    select count(*) from public.guests
--    where lower(email) = 'luca.berresheim@hotmail.de';
--
--    ERWARTET: 1 (nicht 2).
--
-- d) Zaehlerstand vor und nach dem naechsten echten Vorgang vergleichen:
--
--    select count(*) as gaeste from public.guests;


-- -----------------------------------------------------------------------------
-- 4. Rueckbau (falls etwas schiefgeht)
-- -----------------------------------------------------------------------------
--
-- Die alte, in sich geschlossene Trigger-Funktion wiederherstellen: einfach
-- Abschnitt 2 aus `40_gastdaten_entdopplung_etappe3.sql` erneut ausfuehren.
-- Sie enthaelt die Kaskade vollstaendig und ueberschreibt die hier angelegte
-- Fassung von link_guest_on_booking_insert().
--
-- Die Funktion find_or_create_guest() kann dabei stehen bleiben — sie stoert
-- nicht. Wer sie doch entfernen will:
--
--    drop function if exists public.find_or_create_guest(
--      text, text, text, text, text, text, date, text, text, text
--    );
--
-- ACHTUNG: Nicht entfernen, solange chat-assistant oder import-guest-list sie
-- bereits per RPC aufrufen — dort schlaegt sonst das Anlegen von Buchungen
-- fehl.


-- -----------------------------------------------------------------------------
-- 5. Was danach noch fehlt
-- -----------------------------------------------------------------------------
--
-- Dieses Skript stellt die Funktion bereit. Die beiden Schreibpfade rufen sie
-- erst auf, wenn ihr Code angepasst ist:
--
--   supabase/functions/chat-assistant/index.ts
--     -> executeAcceptBookingInquiry(): vor dem INSERT die Funktion per RPC
--        aufrufen und guest_id mitgeben.
--
--   supabase/functions/import-guest-list/index.ts
--     -> dieselbe Ergaenzung je importiertem Meldeschein.
--
-- Bis dahin aendert sich nichts: Der Trigger faengt sie weiterhin ab.
-- Das Skript ist also gefahrlos allein ausfuehrbar.

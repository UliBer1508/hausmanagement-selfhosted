-- =============================================================================
-- 40_gastdaten_entdopplung_etappe3.sql
--
-- ETAPPE 3 aus docs/Konzept-Gastdaten-Entdopplung.md:
-- Die Richtung der Datenhoheit wird umgedreht.
--
-- VORHER: bookings.guest_* war der Eingangskanal. Der Trigger
--         sync_guest_from_booking() las bei JEDEM Insert UND Update die
--         Kopiespalten und schrieb sie nach guests. Damit war faktisch die
--         Buchung die Quelle und die Gaestetabelle die Ableitung — genau
--         andersherum als es das relationale Modell vorsieht.
--
-- NACHHER: guests ist die Quelle. Zwei klar getrennte Aufgaben:
--   1. link_guest_on_booking_insert  — findet oder erzeugt den Gast und setzt
--      guest_id. NUR bei INSERT, NUR wenn guest_id leer ist.
--   2. sync_guest_to_bookings        — haelt die Kopiespalten in bookings
--      aktuell, solange sie noch existieren (Kompatibilitaetsschicht bis
--      Etappe 6).
--
-- WARUM DIESE REIHENFOLGE: Die Kopiespalten sind heute der einzige Weg, auf dem
-- Gaeste ueberhaupt entstehen — zwei der vier Schreibpfade (import-guest-list,
-- chat-assistant) setzen guest_id gar nicht. Wer die Spalten stilllegt, bevor
-- der Link-Trigger steht, legt die Gast-Erzeugung still.
--
-- ZUSAETZLICH GEHAERTET: Die Kaskade bekommt eine sechste Stufe (E-Mail allein).
-- Grund: der UNIQUE INDEX guests_email_unique. Details an der Stelle selbst.
--
-- IDEMPOTENT: mehrfaches Ausfuehren ist unschaedlich.
-- AUSFUEHREN: Supabase Dashboard -> SQL Editor. NICHT per db push.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Alten Trigger entfernen
-- -----------------------------------------------------------------------------
--
-- Geprueft am 12.08.2026 per pg_trigger: es existiert genau EIN Trigger dieser
-- Funktion, naemlich sync_booking_guest_trigger. Der zweite im Repo
-- (sync_guest_on_booking_change, Migration 20251217145322) wurde nie angelegt.
-- Die zweite Zeile steht dennoch da, falls er nachtraeglich entstehen sollte.

drop trigger if exists sync_booking_guest_trigger   on public.bookings;
drop trigger if exists sync_guest_on_booking_change on public.bookings;


-- -----------------------------------------------------------------------------
-- 2. Gast verknuepfen — nur beim Anlegen
-- -----------------------------------------------------------------------------
--
-- Uebernimmt die fuenfstufige Kaskade des alten Triggers unveraendert. Sie hat
-- sich bewaehrt: 116 Gaeste auf 123 Buchungen, keine Namensdubletten
-- (geprueft 12.08.2026).
--
-- ZWEI UNTERSCHIEDE ZUM ALTEN TRIGGER:
--   a) Laeuft nur bei INSERT. Ein UPDATE aendert die Zuordnung nie mehr —
--      dieselbe Regel, die Etappe 2 im Buchungsformular durchsetzt.
--   b) Laeuft nur, wenn guest_id leer ist. Wer die Zuordnung bewusst mitgibt
--      (Buchungsformular, useBookingInquiries), behaelt sie.
--
-- Der Gast wird beim Anlegen aus den mitgelieferten Feldern befuellt. Das ist
-- kein Rueckschritt: Beim Anlegen einer Buchung SIND die Buchungsfelder die
-- einzige Datenquelle, die es gibt. Ab dem zweiten Speichern ist guests die
-- Quelle.

create or replace function public.link_guest_on_booking_insert()
returns trigger
language plpgsql
as $function$
declare
  found_guest_id uuid;
begin
  -- Zuordnung bereits mitgegeben: nichts zu tun.
  if new.guest_id is not null then
    return new;
  end if;

  -- Ohne Namen ist keine Zuordnung moeglich.
  if new.guest_name is null or trim(new.guest_name) = '' then
    return new;
  end if;

  -- PRIORITAET 1: Name + E-Mail
  if new.guest_email is not null and new.guest_email <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(name))  = lower(trim(new.guest_name))
      and lower(trim(email)) = lower(trim(new.guest_email))
    limit 1;
  end if;

  -- PRIORITAET 2: Name + Telefonnummer (normalisiert)
  if found_guest_id is null and new.guest_phone is not null and new.guest_phone <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(name)) = lower(trim(new.guest_name))
      and replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') =
          replace(replace(replace(new.guest_phone, ' ', ''), '-', ''), '+', '')
    limit 1;
  end if;

  -- PRIORITAET 3: Name + Nationalitaet + Stadt
  if found_guest_id is null
     and new.nationality is not null
     and new.guest_city is not null and new.guest_city <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(name))  = lower(trim(new.guest_name))
      and upper(nationality) = upper(new.nationality)
      and lower(trim(city))  = lower(trim(new.guest_city))
    limit 1;
  end if;

  -- PRIORITAET 4: Name + Geburtsdatum
  if found_guest_id is null and new.guest_birth_date is not null then
    select id into found_guest_id
    from public.guests
    where lower(trim(name)) = lower(trim(new.guest_name))
      and birth_date = new.guest_birth_date
    limit 1;
  end if;

  -- PRIORITAET 5: Name + seltene Nationalitaet (nicht DACH).
  -- Bei DE/AT/CH waere der Name allein zu unspezifisch — "Bernd Wagner" und
  -- "Enrico Wagner" sind zwei verschiedene Personen im echten Bestand.
  if found_guest_id is null
     and new.nationality is not null
     and upper(new.nationality) not in ('DE', 'AT', 'CH') then
    select id into found_guest_id
    from public.guests
    where lower(trim(name))  = lower(trim(new.guest_name))
      and upper(nationality) = upper(new.nationality)
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
  -- versuchen -> UNIQUE-Verletzung -> die GESAMTE Buchung schlaegt fehl.
  -- Dieser Fehler steckt unveraendert im alten Trigger; er ist bisher nur nicht
  -- aufgetreten, weil die Portale die Schreibweise konstant halten.
  -- Da der Index E-Mail ohnehin als eindeutig erzwingt, ist Verknuepfen die
  -- einzig konsistente Reaktion.
  if found_guest_id is null and new.guest_email is not null and new.guest_email <> '' then
    select id into found_guest_id
    from public.guests
    where lower(trim(email)) = lower(trim(new.guest_email))
    limit 1;
  end if;

  if found_guest_id is not null then
    -- Bestehender Gast: nur LUECKEN fuellen, nie ueberschreiben. Der Bestand in
    -- guests ist die Quelle; eine neue Buchung darf ihn ergaenzen, nicht
    -- korrigieren.
    new.guest_id := found_guest_id;

    update public.guests set
      email           = coalesce(nullif(new.guest_email, ''), email),
      phone           = coalesce(new.guest_phone,           phone),
      street          = coalesce(new.guest_street,          street),
      city            = coalesce(new.guest_city,            city),
      postal_code     = coalesce(new.guest_postal_code,     postal_code),
      birth_date      = coalesce(new.guest_birth_date,      birth_date),
      travel_document = coalesce(new.guest_travel_document, travel_document),
      nationality     = coalesce(new.nationality,           nationality),
      notes           = coalesce(new.guest_notes,           notes),
      updated_at      = now()
    where id = found_guest_id;
  else
    insert into public.guests (
      name, email, phone, street, city, postal_code,
      birth_date, travel_document, nationality, notes
    ) values (
      trim(new.guest_name),
      nullif(new.guest_email, ''),
      new.guest_phone,
      new.guest_street,
      new.guest_city,
      new.guest_postal_code,
      new.guest_birth_date,
      new.guest_travel_document,
      new.nationality,
      new.guest_notes
    )
    returning id into new.guest_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_link_guest_on_booking_insert on public.bookings;
create trigger trg_link_guest_on_booking_insert
  before insert on public.bookings
  for each row
  execute function public.link_guest_on_booking_insert();


-- -----------------------------------------------------------------------------
-- 3. Kopiespalten aus guests versorgen (Kompatibilitaetsschicht)
-- -----------------------------------------------------------------------------
--
-- Solange noch rund 450 Codestellen die Kopiespalten lesen (161x guest_name im
-- Frontend, ~190 in 17 Edge Functions), muessen sie korrekt bleiben. Ab hier
-- werden sie aber ABGELEITET statt gepflegt: guests ist die Quelle.
--
-- Damit entfaellt der Rueckschreibblock in GuestEditDialog.tsx (Etappe 3b).
-- Eine Stelle in der Datenbank statt zwei Handler in zwei Komponenten, die man
-- beide vergessen kann.
--
-- KEINE NEBENWIRKUNGEN: Am 12.08.2026 gegen alle Trigger auf bookings geprueft.
--   trg_reset_portale_geprueft    feuert nur bei status/check_in/check_out
--   trg_close_max_action_...      feuert nur bei guest_contact_status
--   trg_notify_booking_guest_...  feuert nur bei number_of_guests
-- Keiner davon reagiert auf die Gastfelder. update_bookings_updated_at setzt
-- updated_at neu — das tut der heutige Rueckschreibblock ebenfalls, also keine
-- Verhaltensaenderung.
--
-- WHEN-KLAUSEL: laeuft nur, wenn sich wirklich ein Gastfeld geaendert hat.
-- Ohne sie wuerde jede Aenderung an is_flagged saemtliche Buchungen des Gastes
-- anfassen.

create or replace function public.sync_guest_to_bookings()
returns trigger
language plpgsql
as $function$
begin
  update public.bookings set
    guest_name            = new.name,
    guest_email           = new.email,
    guest_phone           = new.phone,
    nationality           = new.nationality,
    guest_street          = new.street,
    guest_city            = new.city,
    guest_postal_code     = new.postal_code,
    guest_birth_date      = new.birth_date,
    guest_travel_document = new.travel_document,
    guest_notes           = new.notes
  where guest_id = new.id;

  return new;
end;
$function$;

drop trigger if exists trg_sync_guest_to_bookings on public.guests;
create trigger trg_sync_guest_to_bookings
  after update on public.guests
  for each row
  when (
    old.name            is distinct from new.name
    or old.email        is distinct from new.email
    or old.phone        is distinct from new.phone
    or old.nationality  is distinct from new.nationality
    or old.street       is distinct from new.street
    or old.city         is distinct from new.city
    or old.postal_code  is distinct from new.postal_code
    or old.birth_date   is distinct from new.birth_date
    or old.travel_document is distinct from new.travel_document
    or old.notes        is distinct from new.notes
  )
  execute function public.sync_guest_to_bookings();


-- -----------------------------------------------------------------------------
-- 4. Kontrolle nach dem Ausfuehren
-- -----------------------------------------------------------------------------
--
-- a) Haengen die neuen Trigger, ist der alte weg?
--
--    select t.tgname, p.proname
--    from pg_trigger t
--    join pg_class c on c.oid = t.tgrelid
--    join pg_proc  p on p.oid = t.tgfoid
--    where c.relname in ('bookings','guests') and not t.tgisinternal
--    order by c.relname, t.tgname;
--
--    ERWARTET auf bookings: trg_link_guest_on_booking_insert (NEU),
--    trg_close_max_action_on_guest_contacted, trg_notify_booking_guest_count_change,
--    trg_reset_portale_geprueft, update_bookings_updated_at.
--    sync_booking_guest_trigger darf NICHT mehr erscheinen.
--    ERWARTET auf guests: trg_sync_guest_to_bookings (NEU), update_guests_updated_at.
--
-- b) Weichen Kopien und Quelle irgendwo ab? (muss 0 Zeilen liefern)
--
--    select b.id, b.guest_name, g.name
--    from bookings b join guests g on g.id = b.guest_id
--    where b.guest_name  is distinct from g.name
--       or b.guest_email is distinct from g.email;
--
--    HINWEIS: Vor diesem Skript lieferte die Abfrage 3 Zeilen (zwei leere
--    Kopien, ein abweichender Name). Sie verschwinden erst, wenn der jeweilige
--    Gast das naechste Mal bearbeitet wird — der Trigger wirkt nur auf
--    Aenderungen. Ein einmaliger Abgleich des Bestandes ist Abschnitt 5.


-- -----------------------------------------------------------------------------
-- 5. Optional: Bestand einmalig angleichen
-- -----------------------------------------------------------------------------
--
-- Setzt alle Kopiespalten auf den Stand von guests. Geprueft am 12.08.2026:
-- es gibt KEIN Feld, das nur in der Buchung steht und in guests fehlt (alle
-- sieben Zaehler der Pruefabfrage B waren 0). Es kann also nichts verloren
-- gehen.
--
-- BEWUSST AUSKOMMENTIERT: Der Block fasst alle 123 Buchungen an. Erst nach
-- erfolgreicher Kontrolle aus Abschnitt 4 ausfuehren, und nur wenn Abfrage (b)
-- Abweichungen zeigt.
--
--    update public.bookings b set
--      guest_name            = g.name,
--      guest_email           = g.email,
--      guest_phone           = g.phone,
--      nationality           = g.nationality,
--      guest_street          = g.street,
--      guest_city            = g.city,
--      guest_postal_code     = g.postal_code,
--      guest_birth_date      = g.birth_date,
--      guest_travel_document = g.travel_document,
--      guest_notes           = g.notes
--    from public.guests g
--    where g.id = b.guest_id
--      and (b.guest_name is distinct from g.name or b.guest_email is distinct from g.email);


-- -----------------------------------------------------------------------------
-- 6. Rueckbau (falls etwas schiefgeht)
-- -----------------------------------------------------------------------------
--
-- Die alte Funktion sync_guest_from_booking() bleibt in der Datenbank erhalten
-- — nur ihr Trigger wurde entfernt. Zurueck auf den alten Stand:
--
--    drop trigger if exists trg_link_guest_on_booking_insert on public.bookings;
--    drop trigger if exists trg_sync_guest_to_bookings       on public.guests;
--    create trigger sync_booking_guest_trigger
--      before insert or update on public.bookings
--      for each row execute function public.sync_guest_from_booking();
--
-- Danach ist der Zustand vor diesem Skript wiederhergestellt.

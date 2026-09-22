-- =============================================================================
-- 56_buchungs_aenderungen.sql
-- Neue, geänderte und stornierte Buchungen als Hinweis mit "Gesehen"-Quittung
-- =============================================================================
--
-- WARUM (22.09.2026):
-- Am 22.09.2026 kamen zwei neue Buchungen herein (Julia Zeiser, Booking.com,
-- Venediger Chalet; Kwoka Klaudina, Belvilla, Wald Chalet). Nirgends in der
-- Hausverwaltung gab es einen Hinweis darauf. Der Kalender-Abgleich meldet nur
-- UNTERSCHIEDE (Portal belegt, Buchung fehlt) — sobald die Buchung angelegt
-- ist, schweigt er. Uli will aber sehen, DASS sich etwas getan hat.
--
-- Zwei Quellen schreiben in dieselbe Tabelle:
--   1. quelle = 'hausverwaltung' — Trigger auf bookings (diese Datei):
--      neue Buchung, Stornierung, geänderter Zeitraum. Erfasst ALLE Wege,
--      auf denen eine Buchung entsteht (Formular, Max, Import, Anfrage).
--   2. quelle = 'portal' — Edge Function ical-sync: neue, geänderte und
--      weggefallene Portal-Belegungen.
--      ACHTUNG Booking.com: Eine neue Buchung kommt dort oft NICHT als neuer
--      Eintrag, sondern verlängert einen bestehenden Block (Zeiser verlängerte
--      Kerscher 25.–29.12. auf 25.12.–03.01.). Deshalb wird auch jede
--      Datumsänderung eines Blocks festgehalten, nicht nur neue Blocks.
--
-- Der Text wird beim Schreiben EINMAL formuliert (Spalte `text`) und überall
-- unverändert angezeigt: Banner, Sync-Meldung, Morgen-Übersicht, E-Mail.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.
-- =============================================================================

create table if not exists public.buchungs_aenderungen (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references public.houses(id) on delete cascade,
  quelle       text not null check (quelle in ('hausverwaltung', 'portal')),
  art          text not null check (art in ('neu', 'geaendert', 'storniert', 'entfernt')),
  platform     text,
  booking_id   uuid references public.bookings(id) on delete set null,
  von          date,
  bis          date,
  text         text not null,
  erkannt_am   timestamptz not null default now(),
  gesehen_am   timestamptz,          -- "Gesehen" im Banner
  gemailt_am   timestamptz           -- in einer Kalender-Abgleich-Mail enthalten
);

create index if not exists buchungs_aenderungen_offen
  on public.buchungs_aenderungen (erkannt_am desc)
  where gesehen_am is null;

comment on table public.buchungs_aenderungen is
  'Neue/geänderte/stornierte Buchungen (Trigger auf bookings) und Portal-Belegungen (ical-sync). Anzeige im Banner der Übersicht bis "Gesehen".';


-- -----------------------------------------------------------------------------
-- RLS: nur Admins (die Dienstleister-Portale nutzen dasselbe Projekt).
-- Die Edge Functions nutzen den service_role-Key und umgehen RLS.
-- -----------------------------------------------------------------------------
alter table public.buchungs_aenderungen enable row level security;

drop policy if exists buchungs_aenderungen_admin_select on public.buchungs_aenderungen;
create policy buchungs_aenderungen_admin_select on public.buchungs_aenderungen
  for select using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists buchungs_aenderungen_admin_update on public.buchungs_aenderungen;
create policy buchungs_aenderungen_admin_update on public.buchungs_aenderungen
  for update using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));


-- -----------------------------------------------------------------------------
-- Trigger auf bookings
-- -----------------------------------------------------------------------------
-- Liest den Gastnamen aus `guests` (einzige Quelle, siehe Gastdaten-
-- Entdopplung) — NICHT aus bookings.guest_name, denn diese Kopiespalte wird in
-- Etappe 6 gelöscht; ein Verweis darauf würde danach jeden Insert brechen.
--
-- Datumsanzeige in Europe/Berlin: check_in/check_out sind timestamptz.
--
-- SECURITY DEFINER, weil der Trigger in eine Tabelle schreibt, für die der
-- eingeloggte Nutzer bewusst kein INSERT-Recht hat.

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
begin
  -- Vergangene Buchungen sind kein Hinweis wert. Wichtig für
  -- import-guest-list: Der Import legt viele HISTORISCHE Buchungen an — ohne
  -- diese Grenze stünde danach jede einzelne als "Neue Buchung" im Banner.
  if new.check_out is null or new.check_out < now() then
    return new;
  end if;

  -- status ist nullable (Enum booking_status) -> als Text, NULL = aktiv.
  v_status     := coalesce(new.status::text, '');
  v_status_alt := case when tg_op = 'UPDATE' then coalesce(old.status::text, '') else '' end;

  select g.name into v_gast from public.guests g where g.id = new.guest_id;
  v_gast := coalesce(nullif(trim(v_gast), ''), 'ohne Namen');
  v_von  := (new.check_in  at time zone 'Europe/Berlin')::date;
  v_bis  := (new.check_out at time zone 'Europe/Berlin')::date;
  v_plat := coalesce(nullif(new.platform, ''), 'direkt');

  if tg_op = 'INSERT' then
    if v_status = 'cancelled' then
      return new;  -- storniert angelegt (z. B. Import): kein Hinweis
    end if;
    insert into public.buchungs_aenderungen
      (house_id, quelle, art, platform, booking_id, von, bis, text)
    values
      (new.house_id, 'hausverwaltung', 'neu', v_plat, new.id, v_von, v_bis,
       format('Neue Buchung „%s" (%s): %s–%s', v_gast, v_plat,
              to_char(v_von, 'DD.MM.YYYY'), to_char(v_bis, 'DD.MM.YYYY')));
    return new;
  end if;

  -- UPDATE: Stornierung
  if v_status = 'cancelled' and v_status_alt <> 'cancelled' then
    insert into public.buchungs_aenderungen
      (house_id, quelle, art, platform, booking_id, von, bis, text)
    values
      (new.house_id, 'hausverwaltung', 'storniert', v_plat, new.id, v_von, v_bis,
       format('Buchung „%s" (%s) storniert: %s–%s', v_gast, v_plat,
              to_char(v_von, 'DD.MM.YYYY'), to_char(v_bis, 'DD.MM.YYYY')));
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
      (house_id, quelle, art, platform, booking_id, von, bis, text)
    values
      (new.house_id, 'hausverwaltung', 'geaendert', v_plat, new.id, v_von, v_bis,
       format('Buchung „%s" (%s) verschoben: %s → %s–%s', v_gast, v_plat, v_alt,
              to_char(v_von, 'DD.MM.YYYY'), to_char(v_bis, 'DD.MM.YYYY')));
  end if;

  return new;

-- Ein Hinweis darf NIE eine Buchung verhindern. Schlägt das Protokollieren
-- fehl (egal warum), wird nur gewarnt; Insert/Update der Buchung läuft weiter.
exception when others then
  raise warning 'log_buchungs_aenderung: % (Buchung %)', sqlerrm, new.id;
  return new;
end;
$$;

-- AFTER-Trigger: guest_id ist dann bereits gesetzt (trg_link_guest_on_booking_insert
-- läuft BEFORE INSERT). Ein Fehler hier darf eine Buchung nie verhindern —
-- dafür sorgt der EXCEPTION-Block am Ende der Funktion.
-- Nur auf status/check_in/check_out: Zahlungs-Updates (stripe-webhook),
-- Notizen, Gästezahl usw. lösen den Trigger gar nicht erst aus.
drop trigger if exists trg_log_buchungs_aenderung on public.bookings;
create trigger trg_log_buchungs_aenderung
  after insert or update of status, check_in, check_out on public.bookings
  for each row
  execute function public.log_buchungs_aenderung();


-- -----------------------------------------------------------------------------
-- Nachtrag: Buchungen der letzten 24 Stunden, damit der Banner sofort die
-- heutigen Neuzugänge zeigt (Zeiser, Kwoka). Nur wenn noch nicht vorhanden.
-- -----------------------------------------------------------------------------
insert into public.buchungs_aenderungen
  (house_id, quelle, art, platform, booking_id, von, bis, text, erkannt_am)
select b.house_id, 'hausverwaltung', 'neu', coalesce(nullif(b.platform, ''), 'direkt'), b.id,
       (b.check_in at time zone 'Europe/Berlin')::date,
       (b.check_out at time zone 'Europe/Berlin')::date,
       format('Neue Buchung „%s" (%s): %s–%s',
              coalesce(nullif(trim(g.name), ''), 'ohne Namen'),
              coalesce(nullif(b.platform, ''), 'direkt'),
              to_char((b.check_in at time zone 'Europe/Berlin')::date, 'DD.MM.YYYY'),
              to_char((b.check_out at time zone 'Europe/Berlin')::date, 'DD.MM.YYYY')),
       b.created_at
from public.bookings b
left join public.guests g on g.id = b.guest_id
where b.created_at > now() - interval '24 hours'
  and b.status::text <> 'cancelled'
  and not exists (
    select 1 from public.buchungs_aenderungen a
    where a.booking_id = b.id and a.art = 'neu'
  );


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select h.name, a.quelle, a.art, a.text, a.erkannt_am
--   from public.buchungs_aenderungen a join public.houses h on h.id = a.house_id
--   order by a.erkannt_am desc;
--
-- Erwartet: zwei Zeilen "Neue Buchung" (Julia Zeiser, Kwoka Klaudina).
--
--   select tgname from pg_trigger where tgname = 'trg_log_buchungs_aenderung';

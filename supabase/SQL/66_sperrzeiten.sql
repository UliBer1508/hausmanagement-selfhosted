-- =============================================================================
-- 66_sperrzeiten.sql
-- Sperrzeiten je Haus: Zeiträume, die Uli bewusst NICHT vermieten will
-- =============================================================================
--
-- WARUM (19.10.2026):
-- Uli darf das Venediger Chalet zeitweise nicht als Ganzes vermieten und hat
-- deshalb lange Zeiträume in jedem Portal einzeln gesperrt. Die Hausverwaltung
-- wusste davon nichts:
--   - Der Website-Kalender (steinbockchalets.com) zeigte die Zeit als frei.
--   - Der Kalender-Abgleich meldete die Portal-Sperren täglich als
--     „Langsperre — ist das gewollt?" bzw. als mögliche Doppelbuchung.
--   - Die Lückenanalyse zählte gesperrte Monate als Leerstand.
--
-- Ab jetzt ist die Hausverwaltung auch für Sperren der Master-Kalender:
--   Sperre EINMAL hier anlegen (Kalender-Tab, Knopf „Zeitraum sperren")
--     → ical-export gibt sie an Airbnb / VRBO / Belvilla weiter („Belegt")
--     → View public_availability zeigt sie auf der Website als belegt
--     → kalender-abgleich wertet passende Portal-Sperren als gewollt und
--       meldet, wenn die Sperre in Booking.com noch fehlt (Booking.com nimmt
--       keine Feeds von privaten Seiten an — dort bleibt Sperren Handarbeit)
--     → pruefe_belegung warnt beim Anlegen einer Buchung in einer Sperrzeit
--     → Lückenanalyse zählt gesperrte Tage nicht als Lücke
--
-- DATUM — WICHTIG:
--   erster_tag  = erste gesperrte Nacht (Anreise wäre an diesem Tag)
--   letzter_tag = letzte gesperrte Nacht, EINSCHLIESSLICH
--   Beispiel: erster_tag 01.11., letzter_tag 30.11. sperrt alle Nächte im
--   November. Eine Abreise am 01.11. und eine Anreise am 01.12. sind möglich.
--   Für iCal und den Vergleich mit Buchungen (Abreisetag exklusiv) wird
--   intern letzter_tag + 1 verwendet.
--   Typ `date`, nicht `timestamptz`: Eine Sperre ist ganztägig, damit gibt es
--   kein Zeitzonenproblem (vgl. Konzept F5).
--
-- AUSFÜHREN: im SQL-Editor der Hausverwaltung (usblrulkcgucxtkhugck),
-- VOR dem Hochladen des Codes. Idempotent — mehrfaches Ausführen ist
-- unschädlich.
--
-- SCHRITT 0 (vorher, nur lesend, Ergebnis aufheben): aktuelle Definition der
-- View public_availability sichern — Abschnitt 3 erweitert sie.
--   select pg_get_viewdef('public.public_availability'::regclass, true);
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabelle
-- -----------------------------------------------------------------------------
create table if not exists public.sperrzeiten (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references public.houses(id) on delete cascade,
  erster_tag   date not null,
  letzter_tag  date not null,
  grund        text not null
               check (grund in ('eigennutzung', 'behoerdliche_auflage', 'renovierung', 'sonstiges')),
  notiz        text,
  erstellt_von text not null default 'uli',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sperrzeiten_zeitraum check (letzter_tag >= erster_tag)
);

create index if not exists sperrzeiten_haus_zeitraum
  on public.sperrzeiten (house_id, erster_tag, letzter_tag);

comment on table public.sperrzeiten is
  'Bewusst nicht vermietbare Zeiträume je Haus. letzter_tag = letzte gesperrte Nacht (einschließlich). Export an Portale über ical-export, Anzeige auf der Website über public_availability. Siehe SQL 66.';
comment on column public.sperrzeiten.letzter_tag is
  'Letzte gesperrte Nacht, EINSCHLIESSLICH. Für iCal/Buchungsvergleich letzter_tag + 1 verwenden.';
comment on column public.sperrzeiten.grund is
  'eigennutzung | behoerdliche_auflage | renovierung | sonstiges — Freitext in notiz.';

-- GRANTs (Pflicht ab 30.10.2026, PROJEKT-REGELN). KEIN anon-Grant: Grund und
-- Notiz sind intern. Die Website sieht nur Zeiträume, über die Funktion in
-- Abschnitt 3.
grant select, insert, update, delete on public.sperrzeiten to authenticated;
grant select, insert, update, delete on public.sperrzeiten to service_role;

-- RLS: nur Admins (die Dienstleister-Portale nutzen dasselbe Projekt).
alter table public.sperrzeiten enable row level security;

drop policy if exists sperrzeiten_admin_all on public.sperrzeiten;
create policy sperrzeiten_admin_all on public.sperrzeiten
  for all using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- updated_at pflegen
create or replace function public.sperrzeiten_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sperrzeiten_updated_at on public.sperrzeiten;
create trigger trg_sperrzeiten_updated_at
  before update on public.sperrzeiten
  for each row execute function public.sperrzeiten_set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. Nur Zeiträume nach außen — für Website-Kalender
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: Die Website liest anonym. Sie darf erfahren, DASS ein
-- Zeitraum belegt ist, aber nicht warum. Die Funktion gibt deshalb nur
-- Haus und Datum zurück; die Tabelle selbst bleibt für anon gesperrt.
create or replace function public.sperrzeiten_fuer_kalender()
returns table (house_id uuid, von date, bis_exklusiv date)
language sql
stable
security definer
set search_path = public
as $$
  select s.house_id, s.erster_tag, s.letzter_tag + 1
  from public.sperrzeiten s
  where s.letzter_tag >= current_date - 1;
$$;

revoke all on function public.sperrzeiten_fuer_kalender() from public;
grant execute on function public.sperrzeiten_fuer_kalender() to anon, authenticated, service_role;

comment on function public.sperrzeiten_fuer_kalender() is
  'Sperrzeiten ohne Grund/Notiz (Haus, von, bis exklusiv) für die View public_availability. Siehe SQL 66.';


-- -----------------------------------------------------------------------------
-- 3. View public_availability um Sperrzeiten erweitern
-- -----------------------------------------------------------------------------
-- Die View liegt in keiner Repo-Datei (sie stammt aus der Lovable-Zeit). Damit
-- ihre bestehende Logik NICHT verloren geht, wird die aktuelle Definition aus
-- der Datenbank gelesen und nur um einen Teil ergänzt:
--     select alt.* from (<bisherige Definition>) alt
--     union all
--     select … from sperrzeiten_fuer_kalender()
-- Spalten und Typen des Sperrzeiten-Teils werden aus der bestehenden View
-- abgeleitet (gleiche Reihenfolge, gleiche Typen). Die View-Optionen
-- (z. B. security_invoker) werden übernommen — CREATE OR REPLACE VIEW würde
-- sie sonst zurücksetzen.
--
-- Anzeige auf der Website: check_in = erster_tag 12:00, check_out =
-- letzter_tag + 1, 12:00 (Europe/Berlin), status = 'confirmed'. 12:00 statt
-- 00:00, damit der Kalendertag in jeder Zeitzone des Betrachters stimmt.
-- Die Website zeigt dann erster_tag als „Anreise" (halb) und letzter_tag + 1
-- als „Abreise" (halb) — genau wie bei einer Buchung, und richtig: Abreise
-- am ersten und Anreise am Tag nach dem letzten Sperrtag bleiben möglich.
do $$
declare
  v_def      text;
  v_opts     text;
  v_cols     text := '';
  v_sel      text := '';
  r          record;
begin
  v_def := pg_get_viewdef('public.public_availability'::regclass, true);

  if v_def ilike '%sperrzeiten_fuer_kalender%' then
    raise notice 'public_availability enthält die Sperrzeiten bereits — nichts zu tun.';
    return;
  end if;

  v_def := regexp_replace(v_def, ';\s*$', '');

  for r in
    select a.attname, format_type(a.atttypid, a.atttypmod) as typ
    from pg_attribute a
    where a.attrelid = 'public.public_availability'::regclass
      and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  loop
    v_sel := v_sel || case when v_sel = '' then '' else ', ' end ||
      case r.attname
        when 'house_id'  then format('s.house_id::%s', r.typ)
        when 'check_in'  then format('((s.von + time ''12:00'') at time zone ''Europe/Berlin'')::%s', r.typ)
        when 'check_out' then format('((s.bis_exklusiv + time ''12:00'') at time zone ''Europe/Berlin'')::%s', r.typ)
        when 'status'    then format('''confirmed''::%s', r.typ)
        else format('null::%s', r.typ)
      end || format(' as %I', r.attname);
  end loop;

  select coalesce(' with (' || array_to_string(c.reloptions, ', ') || ')', '')
    into v_opts
  from pg_class c
  where c.oid = 'public.public_availability'::regclass;

  execute format(
    'create or replace view public.public_availability%s as '
    'select alt.* from (%s) alt '
    'union all '
    'select %s from public.sperrzeiten_fuer_kalender() s',
    v_opts, v_def, v_sel);

  raise notice 'public_availability um Sperrzeiten erweitert.';
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Einstellung für den Kalender-Abgleich
-- -----------------------------------------------------------------------------
-- Neue Prüfung „Sperre in Booking.com noch nicht gesetzt" (kalender-abgleich).
-- Standard: an. Bestehende Einstellungen bleiben unverändert; ergänzt wird
-- nur der fehlende Schlüssel.
update public.system_settings
set value = jsonb_set(
      value,
      '{checks,sperre_portal_fehlt}',
      'true'::jsonb,
      true)
where key = 'kalender_abgleich_settings'
  and jsonb_typeof(value -> 'checks') = 'object'
  and not (value -> 'checks' ? 'sperre_portal_fehlt');


-- -----------------------------------------------------------------------------
-- 5. pruefe_belegung (SQL 57) kennt Sperrzeiten
-- -----------------------------------------------------------------------------
-- Ersetzt die Fassung aus 57 (gleiche Signatur, gleiche Ergebnisspalten).
-- NEU:
--   'sperrzeit' — der Zeitraum liegt (teilweise) in einer eigenen Sperrzeit
--                 → Warnung mit „Trotzdem speichern" (kein hartes Verbot,
--                   damit Sonderfälle möglich bleiben)
--   Portal-Blocks, deren überlappende Tage durch eigene Buchungen ODER eigene
--   Sperrzeiten gedeckt sind, zählen nicht mehr als eigener Treffer — das ist
--   die manuell im Portal gesetzte Sperre, die zur Sperrzeit gehört.
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

  -- 1. Eigene Buchungen (unverändert aus 57)
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

  -- 2. Eigene Sperrzeiten (NEU 66). Vergleich mit letzter_tag + 1 (exklusiv).
  return query
  select 'sperrzeit'::text,
         'hausverwaltung'::text,
         s.erster_tag,
         s.letzter_tag + 1,
         null::text,
         format('Zeitraum ist gesperrt (%s): Nächte %s–%s%s',
                case s.grund
                  when 'eigennutzung'         then 'Eigennutzung'
                  when 'behoerdliche_auflage' then 'Behördliche Auflage'
                  when 'renovierung'          then 'Renovierung'
                  else 'Sonstiges'
                end,
                to_char(s.erster_tag,  'DD.MM.YYYY'),
                to_char(s.letzter_tag, 'DD.MM.YYYY'),
                case when nullif(trim(s.notiz), '') is not null
                     then ' — ' || trim(s.notiz) else '' end)
  from sperrzeiten s
  where s.house_id = p_house_id
    and s.erster_tag < p_bis
    and s.letzter_tag + 1 > p_von;

  -- 3. Portal-Belegungen
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
      -- Überlappende Tage, die weder durch eigene Buchungen noch durch eigene
      -- Sperrzeiten gedeckt sind
      (select count(*) from generate_series(t.ue_von, t.ue_bis - 1, interval '1 day') d
        where not exists (
          select 1 from bookings b
          where b.house_id = p_house_id
            and coalesce(b.status::text, '') <> 'cancelled'
            and (p_ausser_booking_id is null or b.id <> p_ausser_booking_id)
            and (b.check_in  at time zone 'Europe/Berlin')::date <= d::date
            and (b.check_out at time zone 'Europe/Berlin')::date >  d::date
        )
        and not exists (
          select 1 from sperrzeiten s
          where s.house_id = p_house_id
            and s.erster_tag  <= d::date
            and s.letzter_tag >= d::date
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
  'Belegungsprüfung (eigene Buchungen, eigene Sperrzeiten, Portal-Blocks) für Formular und Max. Siehe SQL 57 und 66.';


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN (nur lesend)
-- =============================================================================
-- a) Tabelle und Rechte:
--      select grantee, privilege_type from information_schema.role_table_grants
--      where table_name = 'sperrzeiten' order by grantee, privilege_type;
--    Erwartet: authenticated + service_role je DELETE/INSERT/SELECT/UPDATE,
--    KEIN anon.
--
-- b) View erweitert:
--      select pg_get_viewdef('public.public_availability'::regclass, true);
--    Erwartet: am Ende „UNION ALL … FROM sperrzeiten_fuer_kalender() s".
--
-- c) Test mit einer Sperre (danach wieder löschen):
--      insert into public.sperrzeiten (house_id, erster_tag, letzter_tag, grund, notiz)
--      values ((select id from houses where name ilike 'Venediger%' limit 1),
--              '2030-01-07', '2030-01-09', 'sonstiges', 'Test SQL 66');
--      select * from public.public_availability where check_in >= '2030-01-01';
--      select * from public.pruefe_belegung(
--        (select id from houses where name ilike 'Venediger%' limit 1),
--        '2030-01-05', '2030-01-08', null, 'direct');
--      delete from public.sperrzeiten where notiz = 'Test SQL 66';
--    Erwartet: eine Zeile 07.01. 12:00 – 10.01. 12:00 in der View und ein
--    Treffer 'sperrzeit' in pruefe_belegung.
--
-- RÜCKBAU der View (nur falls nötig): die in SCHRITT 0 gesicherte Definition
-- mit  create or replace view public.public_availability as <Definition>;
-- wieder einspielen.
-- =============================================================================

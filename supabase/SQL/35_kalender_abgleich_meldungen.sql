-- =============================================================================
-- 35_kalender_abgleich_meldungen.sql
-- E-Mail-Benachrichtigung für den Kalender-Abgleich (Phase 4)
-- Angelegt: 19.07.2026
-- =============================================================================
--
-- ZWECK
-- -----
-- Merkt sich, welche Befunde des Kalender-Abgleichs bereits per E-Mail gemeldet
-- wurden. Ohne diese Tabelle bekäme Uli JEDEN Morgen dieselbe Mail, solange ein
-- Befund offen ist — und würde sie nach drei Tagen ignorieren.
--
-- WARUM EINE EIGENE TABELLE
-- -------------------------
-- Bei Kollisionen hängt das Merk-Flag an der Zeile in external_blocks
-- (Spalte collision_notified). Für den Abgleich geht das nicht: Eine FEHLENDE
-- Buchung ist gerade dadurch definiert, dass es keinen Datensatz gibt, an den
-- man etwas hängen könnte. Der Befund existiert nur als Berechnung.
--
-- Der Schlüssel ist deshalb der Befund selbst (Haus + Art + Zeitraum). Ändert
-- sich der Zeitraum, ist es ein neuer Befund und wird erneut gemeldet — genau
-- richtig, denn ein verschobener Zeitraum bedeutet eine andere Belegung.
--
-- Ausführen im Supabase SQL-Editor (NICHT per CLI/db push — Repo-Regel).
-- =============================================================================


create table if not exists public.kalender_abgleich_meldungen (
  id            uuid primary key default gen_random_uuid(),

  -- Fachlicher Schlüssel: identifiziert den Befund eindeutig.
  house_id      uuid not null references public.houses(id) on delete cascade,
  art           text not null,          -- 'fehlende_buchung' | 'langsperre' | 'feed_fehler'
  platform      text not null,
  von           date,                   -- bei feed_fehler leer
  bis           date,

  -- Wann wurde gemeldet, und wann zuletzt noch gesehen?
  gemeldet_am   timestamptz not null default now(),
  zuletzt_am    timestamptz not null default now(),

  -- Für die Nachvollziehbarkeit: der gemeldete Text im Wortlaut.
  text          text
);

-- Ein Befund darf nur einmal gemeldet werden.
-- coalesce, weil von/bis bei feed_fehler NULL sind und NULL in Postgres
-- nicht mit sich selbst gleich ist — ohne das würde jeder Feed-Fehler
-- als neuer Befund gelten.
create unique index if not exists kalender_abgleich_meldungen_key
  on public.kalender_abgleich_meldungen (
    house_id, art, platform,
    coalesce(von,  '1900-01-01'::date),
    coalesce(bis,  '1900-01-01'::date)
  );

-- Für das Aufräumen alter Meldungen.
create index if not exists kalender_abgleich_meldungen_zuletzt
  on public.kalender_abgleich_meldungen (zuletzt_am);


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Nur Lesen für eingeloggte Nutzer (wie external_blocks). Die Edge Function
-- nutzt den service_role-Key und umgeht RLS ohnehin.

alter table public.kalender_abgleich_meldungen enable row level security;

drop policy if exists kalender_abgleich_meldungen_admin_read
  on public.kalender_abgleich_meldungen;
create policy kalender_abgleich_meldungen_admin_read
  on public.kalender_abgleich_meldungen
  for select to authenticated using (true);


-- -----------------------------------------------------------------------------
-- Empfänger-Einstellung
-- -----------------------------------------------------------------------------
-- Die E-Mail-Adresse steht nicht im Code, damit sie ohne Deploy änderbar ist.
-- Ergänzt die bestehende Einstellung aus 34_kalender_abgleich.sql.

update public.system_settings
set value = value
  || jsonb_build_object(
       'mail_enabled', true,
       'mail_to', 'max.steinbock@gmail.com'
     )
where key = 'kalender_abgleich_settings'
  and not (value ? 'mail_to');


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select value from public.system_settings where key = 'kalender_abgleich_settings';
--
--   select * from public.kalender_abgleich_meldungen order by gemeldet_am desc;
--
-- Nach dem ersten Lauf mit einem Befund sollte hier eine Zeile stehen.
-- Beim zweiten Lauf darf KEINE zweite Zeile entstehen und KEINE zweite Mail
-- rausgehen — nur zuletzt_am wird aktualisiert.
--
-- Meldungen zurücksetzen (falls eine Mail erneut kommen soll):
--   delete from public.kalender_abgleich_meldungen where art = 'fehlende_buchung';
-- =============================================================================

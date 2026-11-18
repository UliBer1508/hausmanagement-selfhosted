-- =============================================================================
-- 69_rechtliches_verfahren.sql
-- Rechtliche Verfahren je Objekt (Tab „Rechtliches")
-- =============================================================================
--
-- WARUM (18.11.2026):
-- Für die Wohnung Winthirstrasse läuft eine Räumungsklage, für Venedigersiedlung
-- 316 ein Verfahren beim Bauamt. Sachstand, Fristen, Fragen an den Anwalt und
-- die Chronik lagen bisher nur außerhalb der App. Jetzt kann für JEDES Objekt
-- (Ferienhaus oder Festvermietung) ein Verfahren mitgeführt werden.
--
--   legal_cases         = ein Verfahren je Objekt (Gericht/Behörde, Aktenzeichen,
--                         Anwalt, Status, wichtige Daten)
--   legal_case_entries  = Chronik, Aufgaben, Fragen an den Anwalt, Fristen
--
-- Die Schonfrist (§ 569 Abs. 3 Nr. 2 BGB) wird NICHT gespeichert, sondern in der
-- App aus served_date (Zustellung der Klage) + 2 Monate berechnet.
--
-- NEUE TABELLEN → GRANTs in derselben Datei (Regel ab 30.10.2026).
-- Kein anon-Zugriff: das sind vertrauliche Verfahrensdaten.
--
-- AUSFÜHREN: im SQL-Editor der Hausverwaltung (usblrulkcgucxtkhugck),
-- VOR dem Hochladen/Mergen des Codes. Idempotent.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Verfahren
-- -----------------------------------------------------------------------------
create table if not exists public.legal_cases (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null,
  case_type text not null default 'sonstiges'
    check (case_type in ('raeumungsklage', 'mietrueckstand', 'behoerde',
                         'gewaehrleistung', 'schaden', 'sonstiges')),
  status text not null default 'offen'
    check (status in ('vorbereitung', 'offen', 'eingereicht', 'zugestellt',
                      'verhandlung', 'urteil', 'vollstreckung', 'ruht', 'erledigt')),
  opponent text,                -- Gegenpartei (Mieter, Behörde, Firma …)
  court_or_authority text,      -- Gericht oder Behörde
  file_number text,             -- Aktenzeichen / Geschäftszahl
  lawyer_name text,
  lawyer_contact text,
  filed_date date,              -- eingereicht am
  served_date date,             -- zugestellt am (Rechtshängigkeit) → Schonfrist
  next_hearing_date date,       -- nächster Termin
  summary text,                 -- Sachstand in eigenen Worten
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_cases_house_id_idx on public.legal_cases(house_id);

comment on table public.legal_cases is
  'Rechtliche Verfahren je Objekt (Räumungsklage, Behörde, Gewährleistung …). Tab „Rechtliches".';
comment on column public.legal_cases.served_date is
  'Zustellung der Klage (Rechtshängigkeit). Schonfrist § 569 Abs. 3 Nr. 2 BGB = + 2 Monate, wird in der App berechnet.';


-- -----------------------------------------------------------------------------
-- 2. Einträge: Chronik, Aufgaben, Fragen, Fristen
-- -----------------------------------------------------------------------------
create table if not exists public.legal_case_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.legal_cases(id) on delete cascade,
  entry_type text not null default 'ereignis'
    check (entry_type in ('ereignis', 'aufgabe', 'frage', 'frist')),
  entry_date date not null default current_date,  -- wann passiert / notiert
  due_date date,                                   -- bis wann (Aufgabe/Frist)
  title text not null,
  details text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_case_entries_case_id_idx on public.legal_case_entries(case_id);


-- -----------------------------------------------------------------------------
-- 3. updated_at-Trigger (Funktion existiert seit 2025, siehe tenant_payments)
-- -----------------------------------------------------------------------------
drop trigger if exists update_legal_cases_updated_at on public.legal_cases;
create trigger update_legal_cases_updated_at
  before update on public.legal_cases
  for each row execute function update_updated_at_column();

drop trigger if exists update_legal_case_entries_updated_at on public.legal_case_entries;
create trigger update_legal_case_entries_updated_at
  before update on public.legal_case_entries
  for each row execute function update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 4. RLS — wie tenant_payments: nur Admin
-- -----------------------------------------------------------------------------
alter table public.legal_cases enable row level security;
alter table public.legal_case_entries enable row level security;

drop policy if exists "Admin full access" on public.legal_cases;
create policy "Admin full access" on public.legal_cases
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Admin full access" on public.legal_case_entries;
create policy "Admin full access" on public.legal_case_entries
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));


-- -----------------------------------------------------------------------------
-- 5. GRANTs (Pflicht ab 30.10.2026) — KEIN anon
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.legal_cases to authenticated;
grant select, insert, update, delete on public.legal_cases to service_role;
grant select, insert, update, delete on public.legal_case_entries to authenticated;
grant select, insert, update, delete on public.legal_case_entries to service_role;


-- -----------------------------------------------------------------------------
-- 6. Startdaten: die beiden laufenden Verfahren (nur, wenn noch nicht vorhanden)
-- -----------------------------------------------------------------------------

-- 6a. Winthirstrasse — Räumungsklage
with h as (
  select id from public.houses where name ilike '%Winthir%' limit 1
), c as (
  insert into public.legal_cases
    (house_id, title, case_type, status, opponent, court_or_authority, summary)
  select h.id,
         'Räumungsklage wegen Mietrückstand',
         'raeumungsklage',
         'eingereicht',
         'Mieter Winthirstraße 4',
         'Amtsgericht München',
         'Mieter zahlt seit Juli 2026 keine Miete. Er behauptet, seine Bank habe '
         || 'Überweisungen nicht ausgeführt, und legt Überweisungsbelege vor, die '
         || 'vermutlich gefälscht sind. Räumungsklage über den Anwalt eingereicht '
         || '(Oktober 2026). Am 16.11.2026 gingen 12.447 € ein (Sonderzahlung, '
         || 'noch keinem Monat zugeordnet). Rückstand Juli–November 20.610 €, '
         || 'Rest 8.163 € (Stand 18.11.2026).'
    from h
   where not exists (
     select 1 from public.legal_cases lc
      where lc.house_id = h.id and lc.case_type = 'raeumungsklage'
   )
  returning id
)
insert into public.legal_case_entries (case_id, entry_type, entry_date, due_date, title, details, done)
select c.id, v.entry_type, v.entry_date::date, v.due_date::date, v.title, v.details, false
  from c, (values
  ('ereignis', '2026-07-03', null, 'Erste Miete nicht gezahlt', 'Fällig 03.07.2026, 4.050 € warm.'),
  ('ereignis', '2026-10-01', null, 'Räumungsklage über Anwalt eingeleitet', 'Genaues Datum der Einreichung nachtragen.'),
  ('ereignis', '2026-11-16', null, 'Eingang 12.447 € (Sonderzahlung)',
     'Nach Einreichung der Klage. Deckt den Rückstand nicht ganz (Rest 8.163 €). '
     || 'In der App als Sonderzahlung gebucht.'),
  ('frage', '2026-11-18', null, 'Wann wurde die Klage zugestellt — wann endet die Schonfrist?',
     '§ 569 Abs. 3 Nr. 2 BGB: Zahlt der Mieter innerhalb von 2 Monaten nach Zustellung den GESAMTEN '
     || 'Rückstand, wird die fristlose Kündigung unwirksam. Zustelldatum im Verfahren eintragen.'),
  ('frage', '2026-11-18', null, 'Wurde zusätzlich hilfsweise ordentlich gekündigt?',
     'Nach BGH (VIII ZR 106/23, 23.10.2024) heilt die Schonfristzahlung nur die fristlose, '
     || 'nicht die ordentliche Kündigung.'),
  ('frage', '2026-11-18', null, 'Auf welche Monate / Kosten werden die 12.447 € verrechnet?',
     '§§ 366, 367 BGB: zuerst Bestimmung des Mieters (Verwendungszweck), sonst Kosten → Zinsen → '
     || 'Hauptforderung, ältere Schuld zuerst. Erst danach Zuordnung in der App.'),
  ('frage', '2026-11-18', null, 'Ab wann Nutzungsentschädigung statt Miete (§ 546a BGB)?', null),
  ('frage', '2026-11-18', null, 'Teilzahlung schriftlich „unter Vorbehalt" bestätigen?', null),
  ('aufgabe', '2026-11-18', null, 'Verwendungszweck der Überweisung vom 16.11. nachsehen und eintragen', null),
  ('aufgabe', '2026-11-18', null, 'Kontoauszug als Beleg an die Sonderzahlung hängen', null),
  ('aufgabe', '2026-11-18', null, 'Anwalt informieren: Eingang 12.447 €, Rest 8.163 €', null),
  ('aufgabe', '2026-11-18', null, 'Keine Monats-Mahnungen aus der App, solange die Sonderzahlung nicht zugeordnet ist', null)
) as v(entry_type, entry_date, due_date, title, details);


-- 6b. Venedigersiedlung 316 — Bauamt Neukirchen (Zweckentfremdung)
with h as (
  select id from public.houses where name ilike '%316%' limit 1
), c as (
  insert into public.legal_cases
    (house_id, title, case_type, status, opponent, court_or_authority, summary)
  select h.id,
         'Bauamt: Verdacht auf Zweckentfremdung',
         'behoerde',
         'offen',
         'Gemeinde Neukirchen am Großvenediger',
         'Bauamt Neukirchen (Ing. Lerch)',
         'Schreiben des Bauamts (Oktober 2026) wegen Verdacht auf Zweckentfremdung '
         || '(Wohnhaus touristisch vermietet). Touristische Vermietung wird eingestellt, '
         || 'künftig Dauervermietung 6–12 Monate. Entscheidung 28.10.2026: keine '
         || 'Stellungnahme ans Bauamt, solange nicht alle Buchungen storniert sind.'
    from h
   where not exists (
     select 1 from public.legal_cases lc
      where lc.house_id = h.id and lc.case_type = 'behoerde'
   )
  returning id
)
insert into public.legal_case_entries (case_id, entry_type, entry_date, title, details, done)
select c.id, v.entry_type, v.entry_date::date, v.title, v.details, false
  from c, (values
  ('ereignis', '2022-11-23', 'Privatzimmervermietung bei der Gemeinde gemeldet', null),
  ('ereignis', '2026-10-01', 'Schreiben Bauamt (Ing. Lerch): Verdacht auf Zweckentfremdung', 'Genaues Datum nachtragen.'),
  ('ereignis', '2026-10-27', 'Dauervermietung beschlossen', 'Mieter für 12 Monate mit Hauptwohnsitz.'),
  ('ereignis', '2026-10-28', 'Booking.com storniert bestehende Buchungen', 'Airbnb storniert die vier offenen Buchungen erst nach schriftlicher Bestätigung der Gemeinde.'),
  ('aufgabe', '2026-10-28', 'Airbnb-Stornierungen klären', null)
) as v(entry_type, entry_date, title, details);


-- -----------------------------------------------------------------------------
-- 7. Prüfung (nur lesend)
-- -----------------------------------------------------------------------------
-- select h.name, c.title, c.status, count(e.id) as eintraege
--   from public.legal_cases c
--   join public.houses h on h.id = c.house_id
--   left join public.legal_case_entries e on e.case_id = c.id
--  group by h.name, c.title, c.status;

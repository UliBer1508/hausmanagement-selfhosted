-- =============================================================================
-- 69_rechtliches_verfahren.sql
-- Rechtliche Verfahren je Objekt (Tab „Rechtliches")
-- =============================================================================
--
-- WARUM (18.11.2026):
-- Sachstand, Fristen, Fragen an den Anwalt und die Chronik laufender
-- Verfahren lagen bisher nur außerhalb der App. Jetzt kann für JEDES Objekt
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
-- 6. Startdaten
-- -----------------------------------------------------------------------------
-- Absichtlich leer: Fall- und Personendaten gehören NICHT in dieses (öffentliche)
-- Repo. Verfahren werden in der App (Tab „Rechtliches") oder direkt in der
-- Datenbank angelegt. (Bereinigt am 18.11.2026.)


-- -----------------------------------------------------------------------------
-- 7. Prüfung (nur lesend)
-- -----------------------------------------------------------------------------
-- select h.name, c.title, c.status, count(e.id) as eintraege
--   from public.legal_cases c
--   join public.houses h on h.id = c.house_id
--   left join public.legal_case_entries e on e.case_id = c.id
--  group by h.name, c.title, c.status;

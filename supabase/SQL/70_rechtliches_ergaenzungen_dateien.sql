-- =============================================================================
-- 70_rechtliches_ergaenzungen_dateien.sql
-- Rechtliches: weitere Eintragsarten, Dateien je Verfahren
-- =============================================================================
--
-- WARUM (18.11.2026):
-- Ein Verfahren besteht aus mehr als Chronik/Aufgaben/Fragen: z. B. eine
-- fristlose UND eine hilfsweise ordentliche Kündigung, Schriftsätze beider
-- Seiten, Beweismittel (Anlagen, Fotos, Umschläge) und Gerichtstermine. Außerdem sollen Dokumente direkt am
-- Verfahren liegen.
--
--   1. legal_case_entries: neue Arten kuendigung / schriftsatz / beweis / termin
--      + Spalten subtype (z. B. fristlos), party (wer), reference (Anlage, Az.)
--   2. legal_case_files: Dateien je Verfahren (optional je Eintrag)
--      + privater Storage-Bucket 'legal-files' (nur Admin)
--
-- NEUE TABELLE → GRANTs in derselben Datei (Regel ab 30.10.2026). Kein anon.
-- VORAUSSETZUNG: 69_rechtliches_verfahren.sql ist gelaufen.
-- AUSFÜHREN: SQL-Editor der Hausverwaltung (usblrulkcgucxtkhugck). Idempotent.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Einträge: neue Arten und Felder
-- -----------------------------------------------------------------------------
alter table public.legal_case_entries
  drop constraint if exists legal_case_entries_entry_type_check;

alter table public.legal_case_entries
  add constraint legal_case_entries_entry_type_check
  check (entry_type in ('ereignis', 'aufgabe', 'frage', 'frist',
                        'kuendigung', 'schriftsatz', 'beweis', 'termin'));

alter table public.legal_case_entries add column if not exists subtype text;
alter table public.legal_case_entries add column if not exists party text;
alter table public.legal_case_entries add column if not exists reference text;

comment on column public.legal_case_entries.subtype is
  'Unterart, z. B. bei kuendigung: fristlos | ordentlich | hilfsweise_ordentlich';
comment on column public.legal_case_entries.party is
  'Von wem: wir | anwalt | gegner | gericht | behoerde | sonstige';
comment on column public.legal_case_entries.reference is
  'Anlage-Nr., Aktenzeichen, Zeichen o. Ä.';


-- -----------------------------------------------------------------------------
-- 2. Dateien je Verfahren
-- -----------------------------------------------------------------------------
create table if not exists public.legal_case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.legal_cases(id) on delete cascade,
  entry_id uuid references public.legal_case_entries(id) on delete set null,
  file_path text not null,          -- Pfad im Bucket 'legal-files'
  file_name text not null,          -- Originalname
  mime_type text,
  size_bytes bigint,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists legal_case_files_case_id_idx on public.legal_case_files(case_id);

alter table public.legal_case_files enable row level security;

drop policy if exists "Admin full access" on public.legal_case_files;
create policy "Admin full access" on public.legal_case_files
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

grant select, insert, update, delete on public.legal_case_files to authenticated;
grant select, insert, update, delete on public.legal_case_files to service_role;

-- Privater Bucket (kein öffentlicher Link — Anzeige über signierte URLs)
insert into storage.buckets (id, name, public)
values ('legal-files', 'legal-files', false)
on conflict (id) do update set public = false;

drop policy if exists "legal_files_admin_select" on storage.objects;
drop policy if exists "legal_files_admin_insert" on storage.objects;
drop policy if exists "legal_files_admin_update" on storage.objects;
drop policy if exists "legal_files_admin_delete" on storage.objects;

create policy "legal_files_admin_select" on storage.objects for select to authenticated
  using (bucket_id = 'legal-files' and public.has_role(auth.uid(), 'admin'));
create policy "legal_files_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'legal-files' and public.has_role(auth.uid(), 'admin'));
create policy "legal_files_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'legal-files' and public.has_role(auth.uid(), 'admin'));
create policy "legal_files_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'legal-files' and public.has_role(auth.uid(), 'admin'));


-- -----------------------------------------------------------------------------
-- 3. Falldaten
-- -----------------------------------------------------------------------------
-- Absichtlich leer: Fall- und Personendaten gehören NICHT in dieses (öffentliche)
-- Repo. (Bereinigt am 18.11.2026.)


-- -----------------------------------------------------------------------------
-- 4. Prüfung (nur lesend)
-- -----------------------------------------------------------------------------
-- select entry_type, count(*) from public.legal_case_entries e
--   join public.legal_cases c on c.id = e.case_id
--   join public.houses h on h.id = c.house_id
--  group by entry_type order by entry_type;

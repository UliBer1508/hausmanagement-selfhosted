-- =============================================================================
-- 71_rechtliches_dokumente_ueber_dms.sql
-- Dokumente der Verfahren laufen über die Dokumentenverwaltung (OneDrive)
-- =============================================================================
--
-- WARUM (18.11.2026, Vorgabe Uli):
-- „Die Dokumente werden in unserem Dokumentenmanagement gehalten.“
-- SQL 70 hatte einen eigenen Supabase-Speicher (Bucket 'legal-files', Tabelle
-- legal_case_files) angelegt. Das wäre eine zweite Ablage neben OneDrive —
-- genau das, was docs/Dokumentenverwaltung-OneDrive.md ausschließt
-- („Zwei Ablagen wären zwei Wahrheiten“).
--
-- Jetzt:
--   1. Neue Zuordnungsart 'verfahren' in document_links. Ein Dokument liegt
--      wie jedes andere in OneDrive (Ablageort über das Haus des Verfahrens)
--      und ist zusätzlich mit dem Verfahren verknüpft.
--   2. legal_case_files und Bucket 'legal-files' entfernen (waren leer).
--
-- Keine neue Tabelle → keine GRANTs nötig.
-- AUSFÜHREN: SQL-Editor der Hausverwaltung (usblrulkcgucxtkhugck). Idempotent.
-- =============================================================================


-- 1. Zuordnungsart 'verfahren'
alter table public.document_links
  drop constraint if exists document_links_entity_type_check;

alter table public.document_links
  add constraint document_links_entity_type_check
  check (entity_type in ('haus','provider','vendor','portal','buchung','reinigung','waesche','verfahren'));

comment on column public.document_links.entity_type is
  'Zuordnungsart; verfahren = legal_cases.id (seit SQL 71)';


-- 1b. Position: bisher nur 2 und 3. Aus dem Tab „Rechtliches“ abgelegte
--     Dokumente bekommen das Verfahren IMMER zusätzlich — auch wenn die
--     2. und 3. Zuordnung schon belegt sind. Deshalb bis 9.
alter table public.document_links
  drop constraint if exists document_links_position_check;
alter table public.document_links
  add constraint document_links_position_check check (position between 2 and 9);


-- 2. Eigenen Speicher aus SQL 70 entfernen — nur, wenn er leer ist
do $$
begin
  if to_regclass('public.legal_case_files') is not null
     and exists (select 1 from public.legal_case_files) then
    raise exception 'legal_case_files enthält Dateien — erst nach OneDrive übernehmen';
  end if;
end $$;

drop table if exists public.legal_case_files;

drop policy if exists "legal_files_admin_select" on storage.objects;
drop policy if exists "legal_files_admin_insert" on storage.objects;
drop policy if exists "legal_files_admin_update" on storage.objects;
drop policy if exists "legal_files_admin_delete" on storage.objects;

-- Den (leeren, privaten) Bucket 'legal-files' lässt Supabase per SQL nicht
-- löschen („Use the Storage API instead“). Ohne Policies ist er unerreichbar;
-- entfernen im Dashboard: Storage → legal-files → Delete bucket.

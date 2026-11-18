-- =============================================================================
-- 70_rechtliches_ergaenzungen_dateien.sql
-- Rechtliches: weitere Eintragsarten, Dateien je Verfahren, Akte Winthirstrasse
-- =============================================================================
--
-- WARUM (18.11.2026):
-- Ein Verfahren besteht aus mehr als Chronik/Aufgaben/Fragen. Bei der
-- Winthirstrasse gibt es z. B. eine fristlose UND eine hilfsweise ordentliche
-- Kündigung, Schriftsätze beider Seiten, Beweismittel (Anlagen B1–B11, Fotos,
-- Umschläge) und Gerichtstermine. Außerdem sollen Dokumente direkt am
-- Verfahren liegen.
--
--   1. legal_case_entries: neue Arten kuendigung / schriftsatz / beweis / termin
--      + Spalten subtype (z. B. fristlos), party (wer), reference (Anlage, Az.)
--   2. legal_case_files: Dateien je Verfahren (optional je Eintrag)
--      + privater Storage-Bucket 'legal-files' (nur Admin)
--   3. Akte Winthirstrasse aus den Unterlagen bis 16.11.2026 ergänzen
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
-- 3. Akte Winthirstrasse (Stand 18.11.2026, aus den Unterlagen)
--    Läuft nur einmal: erkennt am Eintrag "Fristlose Kündigung", ob schon ergänzt.
-- -----------------------------------------------------------------------------
do $$
declare
  v_case uuid;
begin
  select c.id into v_case
    from public.legal_cases c
    join public.houses h on h.id = c.house_id
   where h.name ilike '%Winthir%' and c.case_type = 'raeumungsklage'
   limit 1;

  if v_case is null then
    raise notice 'Verfahren Winthirstrasse nicht gefunden — 69 zuerst ausführen';
    return;
  end if;

  if exists (select 1 from public.legal_case_entries
              where case_id = v_case and entry_type = 'kuendigung') then
    raise notice 'Akte Winthirstrasse bereits ergänzt — übersprungen';
    return;
  end if;

  -- Stammdaten des Verfahrens
  update public.legal_cases set
    status = 'verhandlung',
    opponent = 'Sascha René Rowold',
    court_or_authority = 'Amtsgericht München, Pacellistr. 5',
    file_number = '461 C 15171/26',
    lawyer_name = 'RA Martin Sauer (Fachanwalt Mietrecht), Zeichen 190/26 MS',
    lawyer_contact = 'Tel. 089 51505902 · Fax 089 51514922 · info@mietrechtskanzlei-muenchen.de',
    next_hearing_date = '2026-11-17',
    summary =
      'Mieter zahlt seit Juli 2026 keine Miete. Kündigung vom 30.06.2026 fristlos und '
      || 'hilfsweise ordentlich (über Haus- und Grundbesitzerverein, RAin Congiu-Webbe). '
      || 'Räumungsklage über RA Sauer, AG München 461 C 15171/26. Rowold legt '
      || 'Zahlungsbelege vor (Wise, Revolut, UBS), die nach RA Sauer gefälscht sind '
      || '(Schriftsatz 15.10.2026). Termin 17.11.2026, 08:30 Uhr; Rowold beantragte '
      || 'aus den USA Verlegung ab 30.11. Am 16.11.2026 überwies seine Mutter '
      || '12.447 € (Sonderzahlung); eine zweite Teilzahlung ist angekündigt, Rowold '
      || 'beruft sich auf die Schonfrist (§ 569 Abs. 3 Nr. 2 BGB).'
  where id = v_case;

  -- Bestehende Einträge aus 69 präzisieren
  update public.legal_case_entries set
    done = true,
    details = coalesce(details || E'\n', '')
      || 'JA: Laut Rowolds Schreiben vom 02.09.2026 an Haus & Grund wurde fristlos UND '
      || 'hilfsweise ordentlich gekündigt (Kündigung datiert 30.06.2026).'
  where case_id = v_case and entry_type = 'frage'
    and title ilike 'Wurde zusätzlich hilfsweise ordentlich%';

  update public.legal_case_entries set
    details = coalesce(details || E'\n', '')
      || 'ACHTUNG: RA Sauer antwortet am 07.10. bereits auf die Klageerwiderung — die Klage '
      || 'war also VOR dem 07.10. zugestellt. Die Schonfrist kann schon Mitte November enden.'
  where case_id = v_case and entry_type = 'frage'
    and title ilike 'Wann wurde die Klage zugestellt%';

  update public.legal_case_entries set
    entry_date = '2026-09-03',
    title = 'Mandat RA Sauer / Räumungsklage eingeleitet',
    details = 'Kostenvorschuss 1.792,50 € an RA Sauer am 03.09.2026 überwiesen (190/26 MS). '
           || 'Datum der Klageeinreichung nachtragen.'
  where case_id = v_case and entry_type = 'ereignis'
    and title = 'Räumungsklage über Anwalt eingeleitet';

  -- Kündigungen
  insert into public.legal_case_entries (case_id, entry_type, subtype, party, entry_date, title, details) values
  (v_case, 'kuendigung', 'fristlos', 'wir', '2026-06-30',
   'Fristlose Kündigung wegen Zahlungsverzug (§ 543 Abs. 2 Nr. 3 BGB)',
   'Erklärt über Haus- und Grundbesitzerverein München, RAin Astrid Congiu-Webbe (Zeichen cw/kp #74905). '
   || 'Zugang beim Mieter nachtragen. Rowold rügt: Datum 30.06. trotz Rückständen Juli/August, '
   || 'späterer Versand, alte Miete 4.050 € angesetzt. Kann durch vollständige Schonfristzahlung entfallen.'),
  (v_case, 'kuendigung', 'hilfsweise_ordentlich', 'wir', '2026-06-30',
   'Hilfsweise ordentliche Kündigung (§ 573 Abs. 2 Nr. 1 BGB)',
   'Im selben Schreiben. Wird durch eine Schonfristzahlung NICHT geheilt '
   || '(BGH VIII ZR 106/23 vom 23.10.2024). Beendigungsdatum mit RA Sauer klären.');

  -- Schriftsätze und Schreiben
  insert into public.legal_case_entries (case_id, entry_type, party, entry_date, title, details, reference) values
  (v_case, 'schriftsatz', 'gegner', '2026-09-02',
   'Rowold an Haus & Grund: Widerspruch, Revolut-Belege über 12.447 €',
   'Behauptet Zahlung 27.08. und Rückbuchung 02.09.; kündigt Zahlung durch einen Familienangehörigen an; '
   || 'widerspricht der fristlosen und hilfsweise ordentlichen Kündigung.', 'cw/kp #74905'),
  (v_case, 'schriftsatz', 'gegner', '2026-10-06',
   'Klageerwiderung Rowold (genaues Datum nachtragen)',
   'Behauptet, die Rückstände seien ausgeglichen. Liegt vor dem 07.10.2026.', null),
  (v_case, 'schriftsatz', 'anwalt', '2026-10-07',
   'Replik RA Sauer',
   'Rückstände Juli–Oktober nicht ausgeglichen; Bitte um kurzfristige Terminierung.', '190/26 MS'),
  (v_case, 'schriftsatz', 'gegner', '2026-10-08',
   'Schriftsatz Rowold mit Anlagen B1–B11',
   'Angebliche Zahlungsnachweise (Wise, Revolut, UBS), Indexmietanpassung, E-Mails.', 'B1–B11'),
  (v_case, 'schriftsatz', 'anwalt', '2026-10-15',
   'RA Sauer: Belege B1, B3, B4 offensichtlich gefälscht',
   'Ungültige BIC/IBAN, unmögliche Transaktions-ID, Logikbruch der „Rückbuchung“. '
   || 'Bitte um Vorverlegung des Termins, Vorlage der Originale und PDF-Originale; '
   || 'regt Weiterleitung an die Staatsanwaltschaft an.', '190/26 MS'),
  (v_case, 'schriftsatz', 'wir', '2026-10-16',
   'Eigene Prüfliste zum Schriftsatz (Claude)',
   'Beschleunigungshebel: § 283a ZPO, Negativbescheinigung, weitere fristlose Kündigung, '
   || 'keine Räumungsfrist, Strafanzeige separat. Siehe Aufgaben.', null),
  (v_case, 'schriftsatz', 'gegner', '2026-11-11',
   'Rowold: Antrag auf Terminsverlegung',
   'Laut Rowold persönlich in den Gerichtsbriefkasten eingeworfen (ca. 16:30 Uhr).', null),
  (v_case, 'schriftsatz', 'gegner', '2026-11-15',
   'Fax Rowold aus den USA: Verlegung ab 30.11., hilfsweise Video',
   'Behauptet, von der Ladung erst am 09.11. erfahren zu haben. Legt E-Mail '
   || '„Financière Agache“ vom 29.09. zu US-Terminen vor. Schriftsatz Sauer vom 16.10. '
   || 'angeblich erst nach dem 11.11. gelesen.', null),
  (v_case, 'schriftsatz', 'gegner', '2026-11-16',
   'Fax Rowold: Mutter überweist 12.447 €, zweite Teilzahlung angekündigt',
   'Zahlung „vorsorglich und ohne Anerkennung“; bittet ausdrücklich um Prüfung von '
   || '§ 569 Abs. 3 Nr. 2 BGB (Schonfrist). Hält Verlegungsantrag aufrecht.', null);

  -- Termine
  insert into public.legal_case_entries (case_id, entry_type, entry_date, title, details) values
  (v_case, 'termin', '2026-11-17',
   'Güteverhandlung und ggf. Haupttermin, 08:30 Uhr',
   'Persönliches Erscheinen Rowold angeordnet. Ergebnis nachtragen.');

  -- Beweise
  insert into public.legal_case_entries (case_id, entry_type, party, entry_date, title, details, reference) values
  (v_case, 'beweis', 'gegner', '2026-10-07',
   'Wise-Beleg über 16.596 €',
   'Ungültige Empfänger-BIC „DRESDFF700“; Zahlung exakt 24 h 3 s nach Auftrag; kein Eingang auf dem Konto.', 'B1'),
  (v_case, 'beweis', 'gegner', '2026-08-28',
   'Revolut-Bestätigung über 12.447 €',
   'Referenz „djfksjfds“, Transaktions-ID ist keine UUID; Status „Abgeschlossen“ trotz angeblicher Rückbuchung.', 'B3'),
  (v_case, 'beweis', 'gegner', '2026-09-02',
   'Revolut-Kontoauszug „Rückbuchung“ 12.447 €',
   'Gegen-IBAN existiert nicht (…0482543903), BIC falsch, andere Adresse (Barer Str. 33).', 'B4'),
  (v_case, 'beweis', 'gegner', '2026-07-07',
   'UBS-Aufträge Juli/August (CHF 3.970 / 3.869)',
   'Erst- und Zweitvisum durch dieselbe Person auf einem Privatkonto, Visum einen Tag nach Ausführung; kein Eingang.', 'B8/B9'),
  (v_case, 'beweis', 'sonstige', '2024-10-22',
   'Creditreform-Auskunft',
   'Harte Negativmerkmale: Nichtabgabe der Vermögensauskunft (AG München, 2022). '
   || 'Relevant für drohende Zahlungsunfähigkeit (§ 283a ZPO).', null),
  (v_case, 'beweis', 'gericht', '2026-09-15',
   'Umschlag AG Wedding (Mahngericht) an Rowold, zugestellt 15.09.2026',
   'Rowold ist Antragsgegner in einem Mahnverfahren — Hinweis auf weitere Gläubiger. Inhalt unbekannt.',
   '26-5180116-0-0'),
  (v_case, 'beweis', 'gericht', '2026-10-14',
   'Umschlag AG München, förmliche Zustellung an Rowold am 14.10.2026',
   'Falls darin die Ladung zum 17.11. war: widerspricht Rowolds Angabe, er habe erst am 09.11. '
   || 'davon erfahren. Umschlag aufbewahren, RA Sauer zeigen.', '461 C 15171/26'),
  (v_case, 'beweis', 'wir', '2026-10-16',
   'Fotos vom 16.10.2026: Möbel vor dem Haus, Treppenhaus',
   'Beschreibung ergänzen: Was zeigen die Fotos, wer hat die Möbel herausgestellt?', null);

  -- Aufgaben
  insert into public.legal_case_entries (case_id, entry_type, entry_date, due_date, title, details) values
  (v_case, 'aufgabe', '2026-11-18', '2026-11-19',
   'DRINGEND: Zustelldatum der Klage bei RA Sauer erfragen und eintragen',
   'Daraus ergibt sich das Ende der Schonfrist. Die zweite Teilzahlung ist angekündigt.'),
  (v_case, 'aufgabe', '2026-11-18', null,
   'Ergebnis des Termins vom 17.11. eintragen', null),
  (v_case, 'aufgabe', '2026-11-18', null,
   'Miethöhe klären: App 4.140 € ab August, Indexanpassung ab 01.05.2026 (Rowold nennt 4.149 €)',
   'Für eine vollständige Schonfristzahlung zählt der genaue Rückstand.'),
  (v_case, 'aufgabe', '2026-10-16', null,
   'Zahlungsklage mit der Räumungsklage verbinden (Klageerweiterung)',
   'Voraussetzung für die Sicherungsanordnung nach § 283a ZPO.'),
  (v_case, 'aufgabe', '2026-10-16', null,
   'Sicherungsanordnung nach § 283a ZPO beantragen lassen',
   'Leistet Rowold die Sicherheit nicht, kann die Räumung per einstweiliger Verfügung angeordnet werden '
   || '(§ 940a Abs. 3 ZPO). Besondere Nachteile per eidesstattlicher Versicherung glaubhaft machen.'),
  (v_case, 'aufgabe', '2026-10-16', null,
   'Negativbescheinigung der Commerzbank (01.07.2026 bis heute) einholen', null),
  (v_case, 'aufgabe', '2026-10-16', null,
   'Weitere fristlose Kündigung wegen Vorlage gefälschter Belege prüfen',
   '§ 543 Abs. 1 BGB, BGH VIII ZR 147/22 — nicht durch Schonfristzahlung heilbar.'),
  (v_case, 'aufgabe', '2026-10-16', null,
   'Antrag auf Versagung der Räumungsfrist (§ 721 ZPO)', null),
  (v_case, 'aufgabe', '2026-10-16', null,
   'Strafanzeige separat erstatten; Aussetzung nach § 149 ZPO widersprechen',
   'Urkundenfälschung (§ 267 StGB), versuchter Prozessbetrug (§ 263 StGB).');

  -- Fragen
  insert into public.legal_case_entries (case_id, entry_type, entry_date, title, details) values
  (v_case, 'frage', '2026-11-18',
   'Wie wirkt sich die angekündigte zweite Teilzahlung aus?',
   'Gleicht sie den gesamten Rückstand aus, und liegt sie noch in der Schonfrist? Die hilfsweise '
   || 'ordentliche Kündigung bleibt in jedem Fall bestehen.'),
  (v_case, 'frage', '2026-11-18',
   'War in der Zustellung vom 14.10. die Ladung zum 17.11.?', null);

  raise notice 'Akte Winthirstrasse ergänzt';
end $$;


-- -----------------------------------------------------------------------------
-- 4. Prüfung (nur lesend)
-- -----------------------------------------------------------------------------
-- select entry_type, count(*) from public.legal_case_entries e
--   join public.legal_cases c on c.id = e.case_id
--   join public.houses h on h.id = c.house_id
--  where h.name ilike '%Winthir%' group by entry_type order by entry_type;

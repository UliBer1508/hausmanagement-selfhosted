-- =============================================================================
-- 67_betriebskosten_je_haus.sql
-- Betriebskosten der Festvermietung: Land und Kostenarten-Auswahl je Haus
-- =============================================================================
--
-- WARUM (01.11.2026):
-- Im Haus-Dialog zeigte der Tab „Nebenkosten" bei JEDEM Haus die touristischen
-- Gebühren (Kurtaxe, Reinigung, Wäsche pro Aufenthalt) — auch bei fest
-- vermieteten Häusern. Für die Festvermietung gibt es seit 12/2025 ein eigenes
-- Betriebskosten-Modell (utility_settings / utility_costs / utility_statements),
-- das aber nur unter Mieter → Nebenkosten erreichbar war. Der Tab zeigt jetzt
-- je nach Vermietungsart das richtige Modell.
--
-- Diese Datei ergänzt das Betriebskosten-Modell um zwei Dinge, die bisher
-- fehlten:
--
--   1. LAND je Haus (utility_settings.country, 'DE' oder 'AT').
--      Die vorhandenen Kostenarten folgen der deutschen BetrKV. Für ein Haus in
--      Österreich gelten andere Regeln (MRG bzw. Mietvertrag). Kostenarten
--      können jetzt einem Land zugeordnet werden (utility_cost_categories.country);
--      NULL = gilt für beide Länder.
--
--   2. KOSTENARTEN-AUSWAHL je Haus (utility_settings.excluded_category_ids).
--      Die Häkchen unter „Kostenarten" wurden bisher NIRGENDS gespeichert —
--      nach dem Neuladen waren sie wieder weg. Jetzt wird pro Haus gespeichert,
--      welche Kostenarten NICHT angeboten werden. Gespeichert wird bewusst die
--      Ausschlussliste: eine später neu angelegte Kostenart erscheint dann
--      automatisch bei allen Häusern. Leer = alle aktiven Kostenarten des
--      Landes (bisheriges Verhalten, bestehende Häuser ändern sich nicht).
--
--   3. Neue Kostenarten: Internet, Strom Mietobjekt (beide Länder) sowie
--      Rauchfangkehrer, Kanalgebühren, Verwaltungshonorar (nur AT).
--      Schornsteinreinigung, Entwässerung, Straßenreinigung = nur DE.
--
-- KEINE neue Tabelle → keine GRANTs nötig (Regel ab 30.10.2026 betrifft nur
-- CREATE TABLE). RLS der beiden Tabellen bleibt unverändert.
--
-- AUSFÜHREN: im SQL-Editor der Hausverwaltung (usblrulkcgucxtkhugck),
-- VOR dem Hochladen/Mergen des Codes. Idempotent — mehrfaches Ausführen ist
-- unschädlich.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Land je Haus + gespeicherte Kostenarten-Auswahl
-- -----------------------------------------------------------------------------
alter table public.utility_settings
  add column if not exists country text not null default 'DE';

alter table public.utility_settings
  add column if not exists excluded_category_ids uuid[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'utility_settings_country_check'
  ) then
    alter table public.utility_settings
      add constraint utility_settings_country_check check (country in ('DE', 'AT'));
  end if;
end $$;

comment on column public.utility_settings.country is
  'Land des Objekts für die Betriebskosten (DE = BetrKV, AT = MRG/Mietvertrag). Steuert, welche Kostenarten angeboten werden.';
comment on column public.utility_settings.excluded_category_ids is
  'Kostenarten, die für dieses Haus NICHT angeboten werden. Leer = alle aktiven Kostenarten des Landes.';


-- -----------------------------------------------------------------------------
-- 2. Land je Kostenart (NULL = beide Länder)
-- -----------------------------------------------------------------------------
alter table public.utility_cost_categories
  add column if not exists country text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'utility_cost_categories_country_check'
  ) then
    alter table public.utility_cost_categories
      add constraint utility_cost_categories_country_check
      check (country is null or country in ('DE', 'AT'));
  end if;
end $$;

comment on column public.utility_cost_categories.country is
  'Land, für das die Kostenart gilt (DE/AT). NULL = beide Länder.';

-- Typisch deutsche Bezeichnungen/Positionen → nur DE
update public.utility_cost_categories
   set country = 'DE'
 where is_system = true
   and country is null
   and name in ('Schornsteinreinigung', 'Entwässerung', 'Straßenreinigung');


-- -----------------------------------------------------------------------------
-- 3. Neue Kostenarten (nur anlegen, wenn der Name noch fehlt)
-- -----------------------------------------------------------------------------
insert into public.utility_cost_categories
  (name, description, default_distribution_key, is_system, is_active, country)
select v.name, v.description, v.key, true, true, v.country
from (values
  ('Internet',
   'Internetanschluss, wenn er laut Mietvertrag vom Vermieter gestellt und umgelegt wird',
   'einheiten', null::text),
  ('Strom Mietobjekt',
   'Strom des Mietobjekts, wenn der Mieter keinen eigenen Vertrag mit dem Versorger hat',
   'einheiten', null::text),
  ('Rauchfangkehrer',
   'Kosten des Rauchfangkehrers (Österreich)',
   'wohnflaeche', 'AT'),
  ('Kanalgebühren',
   'Kanalbenützungsgebühren der Gemeinde (Österreich)',
   'personen', 'AT'),
  ('Verwaltungshonorar',
   'Verwaltungskosten, soweit in Österreich umlagefähig bzw. im Mietvertrag vereinbart',
   'wohnflaeche', 'AT')
) as v(name, description, key, country)
where not exists (
  select 1 from public.utility_cost_categories c where c.name = v.name
);


-- -----------------------------------------------------------------------------
-- 4. Prüfung (nur lesend)
-- -----------------------------------------------------------------------------
-- select name, country, default_distribution_key, is_active
--   from public.utility_cost_categories order by country nulls first, name;
-- select h.name, s.country, s.excluded_category_ids
--   from public.utility_settings s join public.houses h on h.id = s.house_id;
--
-- Ein Haus in Österreich umstellen (Beispiel, Hausname anpassen):
-- update public.utility_settings s set country = 'AT'
--   from public.houses h
--  where h.id = s.house_id and h.name ilike '%Venedigersiedlung%';

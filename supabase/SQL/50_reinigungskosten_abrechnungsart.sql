-- ============================================================
-- 50_reinigungskosten_abrechnungsart.sql
-- Reinigungskosten: Abrechnungsart (Stunde | Pauschale) + MwSt
-- ============================================================
--
-- ANLASS (19.08.2026):
-- Boris (Borislav Pantelic) rechnet seit Rechnung 002048/2026 pauschal ab:
-- 150,00 netto je Reinigung, 20 % USt. Amela bleibt auf Stundensatz.
-- Bisher kannte das System NUR "hourly_rate x cleaning_hours" und gar keine
-- Umsatzsteuer auf der Dienstleisterseite.
--
-- BEFUND VOR DIESER AENDERUNG:
--   service_providers  : hourly_rate, sonst kein Betrags- oder Steuerfeld
--   service_tasks      : cleaning_cost numeric(10,2) ohne Kennzeichnung
--                        netto/brutto, ohne Steuersatz
--   Berechnet wurde an genau drei Stellen im TypeScript-Code,
--   in KEINEM Trigger und in KEINER DB-Funktion.
--
-- NACH DIESER AENDERUNG GILT VERBINDLICH:
--   service_tasks.cleaning_cost           = NETTO
--   service_tasks.cleaning_vat_percentage = Steuersatz zum Zeitpunkt der
--                                           Berechnung (eingefroren)
--   Brutto wird IMMER abgeleitet, nie gespeichert:
--       cleaning_cost * (1 + cleaning_vat_percentage / 100)
--
-- Der Steuersatz wird bewusst AUF DEM TASK mitgeschrieben (wie mwst_satz in
-- laundry_invoices). Sonst wuerde eine spaetere Satzaenderung beim Provider
-- rueckwirkend alle Altbetraege verfaelschen.
--
-- Diese Datei ist idempotent und wird im Supabase SQL-Editor ausgefuehrt
-- (kein db push, siehe supabase/SQL/README.md).
--
-- WICHTIG: Diese Datei aendert KEIN Verhalten und stellt KEINEN Dienstleister
-- um. Sie schafft ausschliesslich die Wahlmoeglichkeit. Alle bestehenden
-- Provider bleiben durch das Default auf 'hourly'. Welcher Dienstleister
-- pauschal oder pro Stunde abrechnet, wird allein in der Oberflaeche
-- entschieden (Provider Verwaltung -> Bearbeiten -> Abrechnungsart) und
-- niemals per SQL gesetzt.

-- ------------------------------------------------------------
-- (1) service_providers: Abrechnungsart, Pauschale, Steuersatz
-- ------------------------------------------------------------

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS billing_mode    text          NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS flat_rate       numeric(10,2),
  ADD COLUMN IF NOT EXISTS vat_percentage  numeric(5,2);

COMMENT ON COLUMN public.service_providers.billing_mode IS
  'Abrechnungsart: hourly = hourly_rate x cleaning_hours, flat = flat_rate je Reinigung. Default hourly.';
COMMENT ON COLUMN public.service_providers.hourly_rate IS
  'Stundensatz NETTO. Nur wirksam bei billing_mode = hourly.';
COMMENT ON COLUMN public.service_providers.flat_rate IS
  'Pauschale NETTO je Reinigungsauftrag. Nur wirksam bei billing_mode = flat.';
COMMENT ON COLUMN public.service_providers.vat_percentage IS
  'Umsatzsteuersatz des Dienstleisters in Prozent, z. B. 20.00. NULL = keine USt ausgewiesen (z. B. Kleinunternehmer).';

-- Erlaubte Werte fuer billing_mode
ALTER TABLE public.service_providers
  DROP CONSTRAINT IF EXISTS service_providers_billing_mode_check;
ALTER TABLE public.service_providers
  ADD CONSTRAINT service_providers_billing_mode_check
  CHECK (billing_mode IN ('hourly', 'flat'));

-- Wer pauschal abrechnet, MUSS eine Pauschale haben.
-- Fuer bestehende Zeilen unkritisch: alle stehen nach dem Default auf 'hourly'.
ALTER TABLE public.service_providers
  DROP CONSTRAINT IF EXISTS service_providers_flat_rate_required_check;
ALTER TABLE public.service_providers
  ADD CONSTRAINT service_providers_flat_rate_required_check
  CHECK (billing_mode <> 'flat' OR flat_rate IS NOT NULL);

-- ------------------------------------------------------------
-- (2) service_tasks: Steuersatz einfrieren, Netto klarstellen
-- ------------------------------------------------------------

ALTER TABLE public.service_tasks
  ADD COLUMN IF NOT EXISTS cleaning_vat_percentage numeric(5,2);

COMMENT ON COLUMN public.service_tasks.cleaning_cost IS
  'Reinigungskosten NETTO. Bei billing_mode=hourly: hourly_rate x cleaning_hours. Bei billing_mode=flat: flat_rate. Brutto wird nie gespeichert, sondern aus cleaning_vat_percentage abgeleitet.';
COMMENT ON COLUMN public.service_tasks.cleaning_vat_percentage IS
  'Umsatzsteuersatz in Prozent, eingefroren zum Zeitpunkt der Kostenberechnung. NULL = kein Satz hinterlegt.';
COMMENT ON COLUMN public.service_tasks.cleaning_hours IS
  'Geplante/tatsaechliche Reinigungsdauer in Stunden. Bei billing_mode=flat NUR Planungsgroesse, KEINE Rechengroesse.';

-- ------------------------------------------------------------
-- (3) Kontrolle (nichts geaendert, nur anzeigen)
-- ------------------------------------------------------------

SELECT
  name,
  service_type,
  billing_mode,
  hourly_rate,
  flat_rate,
  vat_percentage,
  is_active
FROM public.service_providers
ORDER BY name;

-- Erwartet nach diesem Lauf:
--   Amela  cleaning  hourly  <Satz>  NULL  NULL
--   Boris  cleaning  hourly  45.00   NULL  NULL
--   Teuni  laundry   hourly  NULL    NULL  NULL
--
-- Alle stehen unveraendert auf 'hourly' — die Kostenberechnung verhaelt sich
-- exakt wie vorher. Eine Umstellung auf 'flat' wirkt sich erst aus, nachdem
-- die drei Rechenstellen im Code die Abrechnungsart auswerten.

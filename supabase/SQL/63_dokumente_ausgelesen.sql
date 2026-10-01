-- ============================================================
-- 63_dokumente_ausgelesen.sql
-- Dokumente: beim Lesen erkannte Buchungsdaten aufbewahren
-- ============================================================
--
-- Stand 01.10.2026. Baut auf 62 auf. Idempotent.
-- Ausfuehren im Supabase SQL-Editor — VOR dem Frontend (useDocuments
-- laedt die Spalte; fehlt sie, bricht die Dokumentliste ab).
--
-- WARUM: Der Knopf „Buchung anlegen" in der Dokumentliste fuellt das
-- Buchungsformular aus der Unterlage vor (Gast, Zeitraum, Personen, Betrag).
-- Die Datei liegt in OneDrive; sie spaeter erneut herunterzuladen und zu
-- lesen hiesse, der Edge Function onedrive-api eine Download-Aktion zu geben.
-- Einfacher und nachvollziehbar: Was beim Ablegen gelesen wurde, bleibt am
-- Dokument stehen. Es ist eine VORBELEGUNG, keine Wahrheit — die Buchung
-- selbst entsteht erst, wenn Uli das Formular prueft und speichert.
--
-- Inhalt (lib/buchungsUnterlage.ts, GeleseneBuchung):
--   {portal, nummer, gast, gaeste, haustiere, anreise, abreise,
--    betrag, miete, zusatzkosten, hauscode}
--
-- Zusaetzlich dient gast + anreise als Rueckfall-Abgleich, wenn keine
-- Buchung die Nummer traegt („vermutlich erfasst").

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ausgelesen jsonb;

COMMENT ON COLUMN public.documents.ausgelesen IS
  'Beim Ablegen aus dem PDF gelesene Buchungsdaten (Vorbelegung fuer „Buchung anlegen" und Namensabgleich). Nur von „Dokument lesen" geschrieben, nicht gepflegt.';

-- Kontrolle
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'ausgelesen';

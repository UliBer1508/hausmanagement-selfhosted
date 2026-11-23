-- =============================================================================
-- 75_mietobergrenze.sql  (Stand 23.11.2026)
-- =============================================================================
-- Rechtliche Obergrenze der Kaltmiete je Haus, z. B. Mietpreisbremse in München
-- (§ 556d BGB, Bayerische Mieterschutzverordnung 01.01.2026 – 31.12.2029):
-- Neuvermietung höchstens ortsübliche Vergleichsmiete + 10 %, Ausnahme Vormiete.
--
-- Gespeichert als JSON in der Kalkulation des Hauses (eine Zeile je Haus):
--   { "applies": true,                 -- Obergrenze gilt
--     "reference_per_sqm": 15.38,      -- ortsübliche Vergleichsmiete €/m² (Mietspiegel-Rechner)
--     "markup_percent": 10,            -- Zuschlag laut Gesetz (Mietpreisbremse 10 %)
--     "furnished_surcharge": 0,        -- Möblierungszuschlag €/Monat
--     "previous_rent": 3520,           -- Vormiete kalt €/Monat (Ausnahme)
--     "source": "Mietspiegel München 2025, Online-Rechner" }
-- Rechnung: lib/rentalCalc.ts mietobergrenze(). Die KI-Analyse (Edge Function
-- rental-ai-analysis) bekommt das Ergebnis als legal_cap_cold und überschreitet es nicht.
--
-- Bestehende Tabelle, neue Spalte → kein neues GRANT nötig. Wiederholbar.
-- =============================================================================

alter table public.rental_calculations
  add column if not exists rent_cap jsonb;

comment on column public.rental_calculations.rent_cap is
  'Rechtliche Obergrenze Kaltmiete (z. B. Mietpreisbremse): applies, reference_per_sqm, markup_percent, furnished_surcharge, previous_rent, source. Rechnung: lib/rentalCalc.ts mietobergrenze().';

-- Prüfung (nur lesend)
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'rental_calculations' and column_name = 'rent_cap';

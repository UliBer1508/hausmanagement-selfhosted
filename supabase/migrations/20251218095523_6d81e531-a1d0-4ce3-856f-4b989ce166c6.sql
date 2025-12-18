-- Heizkosten-Eintrag löschen (falsch kategorisiert - war Reparatur)
DELETE FROM utility_costs WHERE id = '1cdf5570-a3ab-4b0f-b20c-093b228c9bff';

-- Nebenkostenabrechnung 2024 korrigieren (ohne Heizkosten)
UPDATE utility_statements 
SET 
  total_costs = 475.83,
  tenant_share = 475.83,
  result = -1084.17,
  cost_breakdown = '[{"category_name":"Gebäudeversicherung","distribution_key":"wohnflaeche","percentage":100,"tenant_share":47.74,"total_amount":47.74}, {"category_name":"Grundsteuer","distribution_key":"wohnflaeche","percentage":100,"tenant_share":284.68,"total_amount":284.68}, {"category_name":"Wasserversorgung","distribution_key":"personen","percentage":100,"tenant_share":143.41,"total_amount":143.41}]'::jsonb,
  updated_at = now()
WHERE id = '1dc7bec4-395f-4233-9ccd-c09c800e373b';
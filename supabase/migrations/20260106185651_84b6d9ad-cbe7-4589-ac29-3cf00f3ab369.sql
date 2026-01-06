-- 1. Wald Chalet Regel: Farbe für kitchen_towels hinzufügen
UPDATE linen_set_definitions 
SET custom_categories = jsonb_set(
  custom_categories, 
  '{kitchen_towels,color}', 
  '"white"'
),
updated_at = now()
WHERE id = '465646c3-6558-481b-af20-0c997d5745c9'
  AND custom_categories ? 'kitchen_towels'
  AND NOT (custom_categories->'kitchen_towels' ? 'color');

-- 2. Bestehende Bestellungen korrigieren: kitchen_towels Farbe auf "white" setzen
UPDATE linen_orders 
SET item_variants = COALESCE(item_variants, '{}'::jsonb) || '{"kitchen_towels": "white"}'::jsonb,
updated_at = now()
WHERE items ? 'kitchen_towels' 
  AND (item_variants IS NULL OR NOT (item_variants ? 'kitchen_towels'));
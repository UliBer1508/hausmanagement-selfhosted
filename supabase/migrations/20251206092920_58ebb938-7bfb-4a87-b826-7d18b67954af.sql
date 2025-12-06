-- Update small_towels label from "Handtücher klein"/"Kleine Handtücher" to "Handtücher" in custom_categories JSONB
UPDATE linen_set_definitions
SET custom_categories = jsonb_set(
  custom_categories,
  '{small_towels,label}',
  '"Handtücher"'::jsonb
)
WHERE custom_categories IS NOT NULL
  AND custom_categories->'small_towels' IS NOT NULL
  AND custom_categories->'small_towels'->>'label' IN ('Handtücher klein', 'Kleine Handtücher');
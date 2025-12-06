-- Update kitchen_towels label from "Küchentücher"/"Küchenhandtücher" to "Geschirrtücher" in custom_categories JSONB
UPDATE linen_set_definitions
SET custom_categories = jsonb_set(
  custom_categories,
  '{kitchen_towels,label}',
  '"Geschirrtücher"'::jsonb
)
WHERE custom_categories IS NOT NULL
  AND custom_categories->'kitchen_towels' IS NOT NULL
  AND custom_categories->'kitchen_towels'->>'label' IN ('Küchentücher', 'Küchenhandtücher');
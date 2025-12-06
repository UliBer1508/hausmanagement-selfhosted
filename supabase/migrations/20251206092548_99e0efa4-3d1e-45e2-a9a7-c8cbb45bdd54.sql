-- Update large_towels label from "Handtücher groß" to "Badetücher" in custom_categories JSONB
UPDATE linen_set_definitions
SET custom_categories = jsonb_set(
  custom_categories,
  '{large_towels,label}',
  '"Badetücher"'::jsonb
)
WHERE custom_categories IS NOT NULL
  AND custom_categories->'large_towels' IS NOT NULL
  AND custom_categories->'large_towels'->>'label' = 'Handtücher groß';
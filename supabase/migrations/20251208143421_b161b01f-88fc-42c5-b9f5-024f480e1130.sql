
-- Update sink_towels external_artikelnummer to WA008 for Wald Chalet
UPDATE linen_set_definitions 
SET custom_categories = jsonb_set(
  custom_categories,
  '{sink_towels,external_artikelnummer}',
  '{"white": "WA008", "grey": "WA008"}'::jsonb
)
WHERE house_id = 'a2b4d1f7-f396-40a5-b83f-174ccafa55fd';

-- Update sink_towels external_artikelnummer to WA008 for Venedigersiedlung Chalet
UPDATE linen_set_definitions 
SET custom_categories = jsonb_set(
  custom_categories,
  '{sink_towels,external_artikelnummer}',
  '{"white": "WA008", "grey": "WA008"}'::jsonb
)
WHERE house_id = 'f5b4588b-96cf-46f7-b84a-5f6750f7088e';

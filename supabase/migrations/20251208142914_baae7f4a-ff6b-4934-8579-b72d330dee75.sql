
-- Update Wald Chalet (a2b4d1f7-f396-40a5-b83f-174ccafa55fd)
UPDATE linen_set_definitions 
SET custom_categories = jsonb_build_object(
  'bedding', custom_categories->'bedding' || '{"external_artikelnummer": {"grey_striped": "WA001", "white_striped": "WA005", "colorful": "WA001"}}'::jsonb,
  'pillow_cases', custom_categories->'pillow_cases' || '{"external_artikelnummer": {"grey_striped": "WA002", "white_striped": "WA006", "colorful": "WA002"}}'::jsonb,
  'spannbetttuch', custom_categories->'spannbetttuch' || '{"external_artikelnummer": {"white": "WA003", "white_striped": "WA003", "grey_striped": "WA003"}}'::jsonb,
  'bath_mats', custom_categories->'bath_mats' || '{"external_artikelnummer": {"white": "WA004", "grey": "WA007"}}'::jsonb,
  'small_towels', custom_categories->'small_towels' || '{"external_artikelnummer": {"white": "WA008", "grey": "WA008"}}'::jsonb,
  'large_towels', custom_categories->'large_towels' || '{"external_artikelnummer": {"white": "WA009", "grey": "WA009"}}'::jsonb,
  'sauna_towels', custom_categories->'sauna_towels' || '{"external_artikelnummer": {"white": "WA010", "grey": "WA010"}}'::jsonb,
  'kitchen_towels', custom_categories->'kitchen_towels' || '{"external_artikelnummer": {"white": "WA011"}}'::jsonb,
  'sink_towels', custom_categories->'sink_towels' || '{"external_artikelnummer": {"white": "", "grey": ""}}'::jsonb,
  'table_linens', custom_categories->'table_linens' || '{"external_artikelnummer": {}}'::jsonb
)
WHERE house_id = 'a2b4d1f7-f396-40a5-b83f-174ccafa55fd';

-- Update Venedigersiedlung Chalet (f5b4588b-96cf-46f7-b84a-5f6750f7088e)
UPDATE linen_set_definitions 
SET custom_categories = jsonb_build_object(
  'bedding', custom_categories->'bedding' || '{"external_artikelnummer": {"grey_striped": "WA001", "white_striped": "WA005", "colorful": "WA001"}}'::jsonb,
  'pillow_cases', custom_categories->'pillow_cases' || '{"external_artikelnummer": {"grey_striped": "WA002", "white_striped": "WA006", "colorful": "WA002"}}'::jsonb,
  'spannbetttuch', custom_categories->'spannbetttuch' || '{"external_artikelnummer": {"white": "WA003", "white_striped": "WA003", "grey_striped": "WA003"}}'::jsonb,
  'bath_mats', custom_categories->'bath_mats' || '{"external_artikelnummer": {"white": "WA004", "grey": "WA007"}}'::jsonb,
  'small_towels', custom_categories->'small_towels' || '{"external_artikelnummer": {"white": "WA008", "grey": "WA008"}}'::jsonb,
  'large_towels', custom_categories->'large_towels' || '{"external_artikelnummer": {"white": "WA009", "grey": "WA009"}}'::jsonb,
  'sauna_towels', custom_categories->'sauna_towels' || '{"external_artikelnummer": {"white": "WA010", "grey": "WA010"}}'::jsonb,
  'kitchen_towels', custom_categories->'kitchen_towels' || '{"external_artikelnummer": {"white": "WA011"}}'::jsonb,
  'sink_towels', custom_categories->'sink_towels' || '{"external_artikelnummer": {"white": "", "grey": ""}}'::jsonb,
  'table_linens', custom_categories->'table_linens' || '{"external_artikelnummer": {}}'::jsonb
)
WHERE house_id = 'f5b4588b-96cf-46f7-b84a-5f6750f7088e';

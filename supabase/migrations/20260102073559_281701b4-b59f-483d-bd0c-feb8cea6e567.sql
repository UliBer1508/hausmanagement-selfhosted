
-- Korrektur bestehender Wäschebestellungen mit korrekten Farbvarianten

-- Wald Chalet: Bettwäsche = colorful, Handtücher = white, Badvorleger = grey
UPDATE linen_orders
SET item_variants = '{
  "bedding": "colorful",
  "pillow_cases": "colorful",
  "spannbetttuch": "white",
  "large_towels": "white",
  "small_towels": "white",
  "sauna_towels": "white",
  "bath_mats": "grey",
  "sink_towels": "grey",
  "kitchen_towels": "white"
}'::jsonb
WHERE house_id = 'a2b4d1f7-f396-40a5-b83f-174ccafa55fd'
AND status IN ('offen', 'pending');

-- Venedigersiedlung Chalet: Bettwäsche = grey_striped, Handtücher = white, Badvorleger = grey
UPDATE linen_orders
SET item_variants = '{
  "bedding": "grey_striped",
  "pillow_cases": "grey_striped",
  "spannbetttuch": "white",
  "large_towels": "white",
  "small_towels": "white",
  "sauna_towels": "white",
  "bath_mats": "grey",
  "sink_towels": "grey",
  "kitchen_towels": "white"
}'::jsonb
WHERE house_id = 'f5b4588b-96cf-46f7-b84a-5f6750f7088e'
AND status IN ('offen', 'pending');

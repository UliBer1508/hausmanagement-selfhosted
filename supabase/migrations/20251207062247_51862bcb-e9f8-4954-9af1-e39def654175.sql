-- Update Spannbetttuch label to plural form in custom_categories
UPDATE linen_set_definitions 
SET custom_categories = jsonb_set(
  custom_categories, 
  '{spannbetttuch,label}', 
  '"Spannbetttücher"'
)
WHERE custom_categories ? 'spannbetttuch';
-- Add new fields to houses table for detailed property information
ALTER TABLE houses
ADD COLUMN bedrooms integer,
ADD COLUMN living_area_sqm integer,
ADD COLUMN amenities jsonb DEFAULT '{}'::jsonb;

-- Add helpful comment
COMMENT ON COLUMN houses.bedrooms IS 'Number of bedrooms';
COMMENT ON COLUMN houses.living_area_sqm IS 'Living area in square meters';
COMMENT ON COLUMN houses.amenities IS 'Structured amenities as JSON: sauna, terrace, ski_cellar, garage_spaces, glacier_view, additional_toilet';

-- Update existing Wald Chalet with detailed information
UPDATE houses 
SET 
  bedrooms = 3,
  living_area_sqm = 130,
  amenities = '{
    "sauna": true,
    "terrace": true,
    "ski_cellar": true,
    "garage_spaces": 2,
    "glacier_view": true,
    "additional_toilet": true
  }'::jsonb
WHERE name = 'Wald Chalet';
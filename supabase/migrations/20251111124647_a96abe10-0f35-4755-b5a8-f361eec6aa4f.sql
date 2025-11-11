-- Step 1: Data cleanup - Link the existing review to the correct booking
UPDATE app_reviews 
SET booking_id = '47d69345-fde4-4471-8e8b-e583566721fe'
WHERE id = '188bc85f-1e3a-466c-84a6-65552b62412d';

-- Step 2: Add NOT NULL constraint to prevent future NULL values
ALTER TABLE app_reviews 
ALTER COLUMN booking_id SET NOT NULL;
-- Add new fields to booking_inquiries table
ALTER TABLE booking_inquiries 
ADD COLUMN IF NOT EXISTS number_of_adults INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS number_of_children INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS estimated_amount NUMERIC DEFAULT NULL;

COMMENT ON COLUMN booking_inquiries.number_of_adults IS 'Anzahl Erwachsene';
COMMENT ON COLUMN booking_inquiries.number_of_children IS 'Anzahl Kinder';
COMMENT ON COLUMN booking_inquiries.estimated_amount IS 'Geschätzter Buchungsbetrag in EUR';
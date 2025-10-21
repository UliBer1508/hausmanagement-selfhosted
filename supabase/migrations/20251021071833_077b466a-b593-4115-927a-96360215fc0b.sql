-- Füge neue Spalte additional_fees zur houses Tabelle hinzu
ALTER TABLE houses 
ADD COLUMN additional_fees JSONB DEFAULT '{
  "booking_com": {
    "service_fee_per_stay": 0,
    "tourist_tax_per_night": 2.50,
    "cleaning_fee_per_stay": 80,
    "electricity_fee_per_stay": 40,
    "linen_fee_per_stay": 30,
    "vat_percentage": 19
  },
  "airbnb": {
    "service_fee_per_stay": 0,
    "tourist_tax_per_night": 2.50,
    "cleaning_fee_per_stay": 80,
    "electricity_fee_per_stay": 40,
    "linen_fee_per_stay": 30,
    "vat_percentage": 19
  }
}'::jsonb;
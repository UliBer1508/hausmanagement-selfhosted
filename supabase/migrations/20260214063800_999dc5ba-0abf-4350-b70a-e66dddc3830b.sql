UPDATE linen_orders
SET status = 'offen'
WHERE status = 'cancelled' 
  AND booking_id IN (
    SELECT b.id FROM bookings b 
    WHERE b.status = 'confirmed'
  )
  AND notes LIKE '%Auto-storniert: Überschüssige Bestellung%'
  AND order_source = 'auto_booking_lookahead';
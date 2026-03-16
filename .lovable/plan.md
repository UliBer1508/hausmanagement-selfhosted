
# Entwurfs-Rechnungen für bestehende Bestellungen erstellen

## Ausgangslage
- 36 Wäschebestellungen vorhanden, 0 davon haben bereits eine verknüpfte Rechnung
- Der Trigger greift nur bei neuen Bestellungen, nicht rückwirkend

## Umsetzung
Ein einmaliges SQL-INSERT erstellt für alle bestehenden `linen_orders` ohne zugehörige `laundry_invoices` einen Entwurfs-Eintrag:

```sql
INSERT INTO laundry_invoices (external_rechnung_id, rechnungsnummer, rechnungsdatum, bruttobetrag, status, linen_order_id, kunde_name, notes)
SELECT 
  gen_random_uuid(),
  'ENTWURF-' || LEFT(lo.id::text, 8),
  lo.order_date,
  0,
  'offen',
  lo.id,
  'Teuni Wäscheservice',
  'Auto-erstellt für ' || COALESCE(h.name, 'Unbekannt') || ' - Bestellung vom ' || lo.order_date
FROM linen_orders lo
LEFT JOIN houses h ON h.id = lo.house_id
LEFT JOIN laundry_invoices li ON li.linen_order_id = lo.id
WHERE li.id IS NULL;
```

Dies ist eine reine **Daten-Operation** (INSERT), keine Schema-Änderung. Wird über das Insert-Tool ausgeführt.

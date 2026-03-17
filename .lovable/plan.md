

# Fix: Entwurf-Rechnungsdatum auf Lieferdatum + Löschfunktion prüfen

## Befund

1. **Falsches Datum**: Der Trigger `create_draft_invoice_for_linen_order` verwendet aktuell `CURRENT_DATE`. Die letzte Migration hat es von `order_date` auf `CURRENT_DATE` geändert. Der User möchte aber das **Lieferdatum** (`delivery_date`). Aktuell haben 34 Entwürfe ein falsches Datum.

2. **Löschfunktion**: Der Code für die Löschfunktion (Hook `useDeleteLaundryInvoice`, Trash-Button, AlertDialog) ist bereits im Code vorhanden und korrekt implementiert. Die Buttons sind in der Aktionsspalte sowohl für Entwürfe als auch reguläre Rechnungen sichtbar. Möglicherweise wurde der letzte Build noch nicht vollständig geladen.

## Änderungen

### 1. Neue Migration — Trigger auf `delivery_date` umstellen
Datei: `supabase/migrations/<timestamp>.sql`

```sql
CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_linen_order()
  ...
  -- Statt CURRENT_DATE:
  COALESCE(NEW.delivery_date::date, CURRENT_DATE),
  ...

-- Bestehende Entwürfe korrigieren:
UPDATE laundry_invoices li
SET rechnungsdatum = lo.delivery_date::date
FROM linen_orders lo
WHERE lo.laundry_invoice_id = li.id
  AND li.rechnungsnummer LIKE 'ENTWURF-%'
  AND lo.delivery_date IS NOT NULL;
```

### 2. Keine Code-Änderungen nötig
Die Löschfunktion (`useDeleteLaundryInvoice`, Trash2-Button, AlertDialog) ist bereits vollständig implementiert in:
- `src/hooks/useLaundryInvoices.ts` (Hook mit unlink + delete)
- `src/components/ServicePortal/LaundryInvoicesList.tsx` (Button + Dialog)

Nach dem Deployment sollte die Löschfunktion sichtbar und nutzbar sein.


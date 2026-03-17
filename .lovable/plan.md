

# Bugfix: Entwurf-Rechnungsdatum + Löschfunktion

## Problem 1: Falsches Datum bei automatisch erstellten Rechnungen

Der Trigger `create_draft_invoice_for_linen_order` setzt `rechnungsdatum` auf `NEW.order_date`. Das Datum `02.01.2026` kommt vermutlich daher, dass alle bestehenden `linen_orders` dieses `order_date` hatten, als der Trigger per Migration nachträglich ausgelöst wurde (oder die Bestellungen tatsächlich alle dasselbe Datum haben).

**Fix:** Der Trigger selbst ist korrekt (er verwendet das Bestelldatum). Das Problem sind die bereits existierenden fehlerhaften Entwürfe. Diese sollten per SQL-Migration korrigiert werden:

- Migration: Update aller ENTWURF-Rechnungen, deren `rechnungsdatum` auf das tatsächliche `order_date` der verknüpften `linen_order` gesetzt wird (über `linen_orders.laundry_invoice_id`).
- Zusätzlich: Trigger anpassen, sodass `rechnungsdatum` auf `CURRENT_DATE` statt `NEW.order_date` gesetzt wird — da das Rechnungsdatum logisch das Erstellungsdatum der Rechnung ist, nicht das Bestelldatum.

## Problem 2: Löschfunktion für Rechnungen

Aktuell gibt es keine Möglichkeit, Rechnungen zu löschen. Folgende Änderungen:

### Hook (`useLaundryInvoices.ts`)
- Neuer `useDeleteLaundryInvoice` Hook:
  - Setzt `laundry_invoice_id = null` auf allen verknüpften `linen_orders`
  - Löscht die Rechnung aus `laundry_invoices`
  - Invalidiert Queries
  - Zeigt Toast

### UI (`LaundryInvoicesList.tsx`)
- Lösch-Button (Trash-Icon) in der Aktionsspalte jeder Zeile
- Bestätigungsdialog (AlertDialog) vor dem Löschen
- Für Entwürfe und reguläre Rechnungen verfügbar

### Zusammenfassung der Dateien
1. **Neue Migration** — Korrektur der ENTWURF-Daten + Trigger-Anpassung (`rechnungsdatum = CURRENT_DATE`)
2. **`src/hooks/useLaundryInvoices.ts`** — Neuer `useDeleteLaundryInvoice` Hook
3. **`src/components/ServicePortal/LaundryInvoicesList.tsx`** — Lösch-Button + Bestätigungsdialog mit AlertDialog


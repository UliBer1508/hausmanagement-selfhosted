

# Entwurf bearbeiten und andere Entwürfe zuordnen

## Problem
Aktuell kann man einen Entwurf nur bearbeiten (EditInvoiceDialog) ODER Entwürfe zusammenführen (MergeInvoicesDialog) — aber nicht beides in einem Schritt. Der User möchte einen bestehenden Entwurf nehmen, die Rechnungsdaten ausfüllen, und gleichzeitig andere Entwürfe diesem zuordnen.

## Lösung
Den `EditInvoiceDialog` erweitern: Wenn ein Entwurf bearbeitet wird, erscheint unterhalb des Formulars eine Liste aller anderen Entwürfe mit Checkboxen. Beim Speichern werden die Orders der ausgewählten Entwürfe auf diese Rechnung umgelinkt und die leeren Entwürfe gelöscht.

## Änderungen

### `EditInvoiceDialog.tsx`
- Neuen Query hinzufügen: Alle anderen Draft-Invoices laden (wie `useDraftInvoices`, aber ohne den aktuellen Entwurf)
- Checkbox-Liste der anderen Entwürfe unterhalb des Formulars anzeigen (nur wenn `isDraft`)
- State `mergeIds` (Set) für ausgewählte Entwürfe
- Beim Speichern:
  1. Rechnungsdaten updaten (wie bisher)
  2. Falls `mergeIds` nicht leer: Orders der ausgewählten Entwürfe auf diese Rechnung umlinken (`UPDATE linen_orders SET laundry_invoice_id = thisId WHERE laundry_invoice_id IN mergeIds`)
  3. Leere Entwürfe löschen

### `useLaundryInvoices.ts`
- Neuer Hook `useUpdateInvoiceAndMerge` oder Erweiterung von `useUpdateLaundryInvoice` mit optionalem `mergeDraftIds` Parameter

### Layout im Dialog (nur bei Entwürfen)
```text
┌─────────────────────────────────────┐
│ Rechnungsnummer: [RE-2026-001    ] │
│ Datum: [__]     Fällig: [__]       │
│ Netto: [__]     MwSt: [__]        │
│ MwSt-Betrag: [__]  Brutto: [__]   │
│ Notizen: [______________]          │
│─────────────────────────────────────│
│ Weitere Entwürfe zuordnen:         │
│ ☑ ENTWURF-xxx | Haus A | 15.03    │
│ ☐ ENTWURF-yyy | Haus B | 12.03    │
│ ☑ ENTWURF-zzz | Haus A | 10.03    │
└─────────────────────────────────────┘
         [Abbrechen] [Speichern]
```


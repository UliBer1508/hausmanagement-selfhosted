

# Fix: Entwürfe-Zuordnung im EditInvoiceDialog immer anzeigen

## Problem
Die Zuordnungs-Sektion ("Weitere Entwürfe zuordnen") wird nur angezeigt wenn `isDraft` true ist (Zeile 209). Diese Prüfung basiert auf `invoice.rechnungsnummer?.startsWith('ENTWURF')`. Sobald der User die Rechnungsnummer ändert (z.B. von "ENTWURF-xxx" zu "1"), verschwindet die Sektion sofort, weil React das Formular neu rendert und `isDraft` auf `false` wechselt.

Zusätzlich: Auch bei nicht-Entwurf-Rechnungen sollte man weitere Entwürfe zuordnen können.

## Lösung

### `EditInvoiceDialog.tsx`
- Die `isDraft`-Prüfung auf Zeile 209 entfernen bzw. durch eine einmalige Prüfung ersetzen: `wasDraft` wird einmalig beim Öffnen gesetzt (via `useEffect` oder `useMemo` basierend auf dem initialen `invoice`-Prop)
- Alternativ einfacher: Die Zuordnungs-Sektion **immer** anzeigen wenn `otherDrafts.length > 0`, unabhängig davon ob die aktuelle Rechnung ein Entwurf ist. Das ermöglicht auch das Zuordnen von Entwürfen zu bereits existierenden finalen Rechnungen.

### Konkrete Änderung
- Zeile 209: `{isDraft && otherDrafts.length > 0 && (` ersetzen durch `{otherDrafts.length > 0 && (`
- Zeile 52 (`isDraft`-Variable) nur noch für den Dialog-Titel verwenden

Das ist ein Ein-Zeilen-Fix.


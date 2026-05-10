# Plan: End-to-End-Smoketest der REST-Integration

## Schritt 1 — Rechnungs-Sync triggern
`sync-laundry-invoices` per Edge-Function-Curl aufrufen (nutzt jetzt REST + Portal-Token).
Erwartung: HTTP 200 mit `{ success: true, newCount, updatedCount }` und mindestens 1 verarbeitete Rechnung (R2025-0001).

## Schritt 2 — Logs prüfen
- `sync-laundry-invoices` Logs → "Fetching invoices via REST" muss erscheinen, kein Fallback-Warning.
- `get-external-order-status` Logs (falls Hook im Frontend feuert).

## Schritt 3 — Status-Proxy testen
`get-external-order-status` mit bekannter Bestellnummer (`B0001` aus den Rechnungspositionen) aufrufen.
Erwartung: HTTP 200 mit `{ orders: [{ bestellnummer: "B0001", status: "...", gesamt_preis: ... }] }`.

## Schritt 4 — DB-Verifikation
`select rechnungsnummer, status, bruttobetrag, synced_at from laundry_invoices order by synced_at desc limit 5;`
Erwartung: R2025-0001 vorhanden mit korrektem Brutto (101,30) und frischem `synced_at`.

## Schritt 5 — Bericht
Kurze Zusammenfassung: was funktioniert, was nicht, ggf. nötige Folge-Fixes.

Keine Code-Änderungen geplant — reiner Verifikationslauf.

### Wäscherechnung-Abgleich (neu 03.10.2026)
- `lib/rechnungsAbgleich.ts` — reine Logik: `bildeAbgleich`, `planeAngleichung`, `offeneEntscheidungen`, `setzeEntscheidungenUm`. Tests: `test/rechnungsAbgleich.test.ts` (RG-122-Fall).
- `components/Documents/WaescheAbgleichPanel.tsx` — Entscheidung je Abweichung (angleichen / akzeptieren + Grund).
- `DocumentsTab` (AblageDialog): `submit` sperrt bei offenen Entscheidungen; `rechnungNachtragen` schreibt Angleichung + `laundry_invoices.abgleich` (SQL 64).

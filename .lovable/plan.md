## Ziel

Die alte Wäschebestand-Verwaltung in den **Haus-Cards** (rote Markierung im Screenshot: „Wäschebestand (29 Teile) – Bettwäsche/Handtücher/Saunatücher/WB-Handtücher …") wird komplett entfernt. Sie stammt aus dem Vorgänger-System und wird durch die neue Wäsche-Logik (`linen_set_definitions`, `linen_orders`, Teuni-Integration, Buffer Settings) vollständig abgelöst.

## Was entfernt wird

### 1. UI-Block in `src/components/Houses/HouseCard.tsx`
- Komplettes Block „Wäschebestand" (Zeilen ~172–192)
- Helper `getTotalLinenItems` und `getLinenBreakdown` (~Zeilen 23–47)
- Variablen `totalLinenItems`, `linenBreakdown` (~Zeilen 68–69)

### 2. Initialisierung in `src/components/Houses/CreateHouseDialog.tsx`
Beim Anlegen neuer Häuser werden die Legacy-JSONB-Felder nicht mehr beschrieben (Zeilen ~137–152):
- `linen_stock`, `linen_dirty`, `linen_in_cleaning`, `linen_in_use`, `linen_reserved`, `ordered_linen`

Die DB-Spalten bleiben erhalten (kein Migration-Drop) – nur das Frontend schreibt nichts mehr hinein. So sind Bestandsdaten alter Häuser nicht zerstört.

### 3. Toter Hook löschen: `src/hooks/useLinenManagement.ts`
Wird nirgendwo mehr importiert (nur Self-Reference) – ersatzlos löschen.

### 4. Analyse-Hook bereinigen: `src/hooks/useOptimizedLinenManagement.ts`
`linenAnalysis`-Berechnung nutzt aktuell `house.linen_stock` und `house.ordered_linen` für `currentStock`/`availableStock`. Da die Bestände nicht mehr gepflegt werden, wird:
- `currentStock`/`availableStock` immer auf `0` gesetzt (Felder bleiben im Interface, damit abhängige Komponenten weiter kompilieren)
- Status-Berechnung („critical/low/good") basiert dann ausschließlich auf prognostiziertem Bedarf vs. 0 → Anzeige bleibt funktional, ohne Phantom-Bestände

Falls in einem späteren Schritt gewünscht, kann dieser Hook + abhängige Anzeigen (`LinenInventoryDialog` Bestandsspalten, `SmartLinenDashboard`) separat aufgeräumt werden – für diese Aufgabe hier ist das aber out-of-scope, da die User-Anforderung explizit nur die **Wäschebestand-Anzeige bei den Häusern** betrifft.

## Was NICHT angefasst wird
- `LinenDashboard.tsx` (= aktiver Wäsche-Tab mit Haus-Widgets, Wäsche-Regeln, Teuni-Integration)
- `linen_set_definitions`, `linen_orders`, `buffer_settings`, Teuni-Logik
- DB-Spalten (`linen_stock` etc. bleiben physisch erhalten als Archiv)
- Tenant-Info und alle anderen Teile der HouseCard

## Verifikation
- Häuser-Liste rendert ohne den Wäschebestand-Block, keine Konsolen-Errors
- Neues Haus anlegen funktioniert (kein 400er von Supabase)
- Wäsche-Tab + Haus-Widgets + Wäsche-Regeln-Tab + Teuni-Switch funktionieren weiterhin
- TypeScript-Build ohne Fehler

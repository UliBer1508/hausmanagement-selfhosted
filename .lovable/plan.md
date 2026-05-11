## Ziel
Die beiden Karten unten in der Übersicht sollen echte unverbundene Datensätze anzeigen statt statischer Leertexte.

## Festgestellter Stand
- In der Datenbank existieren aktuell unverbundene Einträge:
  - 2 `service_tasks` ohne `booking_id`
  - 1 `linen_order` ohne `booking_id`
- Alle gefundenen Einträge gehören zu touristischen Häusern und sollten damit im Dashboard sichtbar sein.
- Die beiden Karten in `src/components/Dashboard/OverviewTab.tsx` sind derzeit nur Platzhalter und bekommen gar keine Daten übergeben.

## Umsetzungsplan
1. Daten für unverbundene Einträge im Dashboard ableiten
- In `src/pages/OriginalDashboard.tsx` aus den bereits geladenen `serviceTasks` und `linenOrders` zwei gefilterte Listen ableiten:
  - Service-Aufträge ohne Buchung
  - Wäschebestellungen ohne Buchung
- Dabei nur touristische Häuser berücksichtigen, passend zur bestehenden Dashboard-Logik.

2. Daten an `OverviewTab` durchreichen
- Die Props von `OverviewTab` erweitern, damit die beiden neuen Listen dort verfügbar sind.
- Vorhandene Handler weiterverwenden, damit Bearbeiten/Klick-Verhalten konsistent bleibt.

3. Platzhalterkarten durch echte Inhalte ersetzen
- In `src/components/Dashboard/OverviewTab.tsx` die statischen Texte durch Listen ersetzen.
- Für Service-Aufträge vorhandene `ServiceTaskCard` verwenden.
- Für Wäschebestellungen vorhandene `LaundryOrderCard` verwenden.
- Falls keine Datensätze vorhanden sind, einen echten Empty State anzeigen.

4. Verhalten der Karten konsistent halten
- Unverbundene Wäschebestellungen sollen direkt bearbeitbar bleiben.
- Unverbundene Service-Aufträge sollen wie die übrigen Service-Karten direkt editierbar sein.
- Die Anzeige soll auch abgeschlossene bzw. gelieferte Einträge weiterhin enthalten, wie es die Kartentexte versprechen.

5. Validierung
- Prüfen, dass die drei aktuell vorhandenen unverbundenen Datensätze in der Übersicht erscheinen.
- Prüfen, dass Klick auf die Karten die bestehenden Dialoge öffnet.
- Prüfen, dass bei wirklich leerem Zustand wieder der passende Leertext erscheint.

## Technische Details
- Betroffene Dateien:
  - `src/pages/OriginalDashboard.tsx`
  - `src/components/Dashboard/OverviewTab.tsx`
- Keine Datenbankänderung nötig.
- Ursache ist sehr wahrscheinlich kein Datenproblem, sondern eine fehlende UI-Anbindung: die Daten sind da, die Karten rendern sie nur derzeit nicht.
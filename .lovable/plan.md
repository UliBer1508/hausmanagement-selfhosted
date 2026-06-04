## Problem

Im `EditCleaningTaskDialog` (Reinigungsauftrag bearbeiten) reagiert der runde blaue **X**-Schließen-Button nicht. Im Session-Replay sieht man, dass der User mehrfach klickt, ohne dass der Dialog schließt.

### Ursache

Der globale Schließen-Button ist in `src/components/ui/dialog.tsx` als `absolute right-3 top-3`, 44×44 px gross. Im `EditCleaningTaskDialog`-Header sitzt rechts oben aber zusätzlich:

- Status-Badge ("Abgeschlossen")
- Roter **Löschen**-Button (`<AlertDialogTrigger asChild>` → `<Button>`)

Beide liegen innerhalb der Header-Flexbox mit nur `pr-10`. Der `Löschen`-Button überlappt damit räumlich mit dem X-Button. Da `Löschen` im DOM nach dem X eingefügt sein kann (Portal-Reihenfolge) bzw. das `AlertDialogTrigger` denselben Bereich abfängt, landet der Klick auf `Löschen` (öffnet den Bestätigungs-AlertDialog kurz / schluckt das Event) statt auf X. Ergebnis: Dialog schliesst nicht.

## Lösung

### 1. `EditCleaningTaskDialog` Header reparieren
- Header-Aktionen (Badge + Löschen) auf eigene Zeile *unter* dem Titel verschieben, oder
- klare Trennung zum X erzwingen: `pr-16` auf den Action-Container und `Löschen` darf nicht in den X-Hitbereich (≥ 56 px vom rechten Rand) ragen.

Empfohlen: Badge + Löschen in eine zweite Zeile unter dem Titel, damit X frei bleibt — und die Karte weiterhin auf Mobile sauber aussieht.

### 2. Andere Edit-/Detail-Dialoge prüfen
Folgende Dialoge platzieren ebenfalls Buttons/Badges in den Header und sind kandidatengefährdet für dieselbe Überschneidung mit dem X. Ich prüfe sie und korrigiere identische Überlappungen:

- `src/components/ServicePortal/EditInvoiceDialog.tsx`
- `src/components/ServicePortal/InvoiceDetailsDialog.tsx`
- `src/components/ServicePortal/ProviderManagementDialog.tsx`
- `src/components/ServicePortal/ProviderBillingDialog.tsx`
- `src/components/Tenants/EditPaymentDialog.tsx`
- `src/components/Tenants/RentHistoryDialog.tsx`
- `src/components/Houses/EditHouseDialog.tsx`
- `src/components/Houses/LinenOrderDialog.tsx`
- `src/components/Houses/CompetitorAnalysis/CompetitorDetailsDialog.tsx`
- `src/components/Guests/ActionDetailsDialog.tsx`
- `src/components/Bookings/CreateBookingForm.tsx` (im Dialog-Kontext)

Geprüft wird pro Datei nur: Liegt ein Button/Badge im obersten rechten Bereich des `DialogHeader`? Falls ja → gleiche Korrektur (zweite Zeile oder ausreichend `pr`).

### 3. Verifikation
- Preview öffnen, `EditCleaningTaskDialog` testen: X schliesst zuverlässig, Löschen funktioniert weiterhin.
- Stichprobenartig 2–3 der korrigierten Dialoge im Preview prüfen.

## Nicht im Umfang
- Keine Änderung am globalen X-Style in `dialog.tsx` (würde sonst alle Dialoge verändern).
- Keine Logik-Änderung (Mutations, Queries) — rein Layout/UX.

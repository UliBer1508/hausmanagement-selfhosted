## Ziel
Die Karten in der Buchungs-Verknüpfungs-Ansicht (`ConnectedBookingView`) optisch an die Gäste-Karten angleichen: weiche, rundum gleiche, abgerundete Ecken statt der aktuellen seitlichen Farbleisten (`border-l-4`).

Die farbliche Gruppen-Zuordnung (grün/blau/lila pro Buchung) bleibt erhalten, wird aber dezenter dargestellt — z. B. als kleine farbige Kennzeichnung im Inneren der Karte (Punkt/Akzent), nicht mehr als kantige Seitenleiste, die die Rundung visuell bricht.

## Betroffene Dateien
1. `src/components/Bookings/BookingCard.tsx`
2. `src/components/Bookings/ServiceTaskCard.tsx`
3. `src/components/Bookings/LaundryOrderCardWithStatus.tsx` (live verwendet) und zur Konsistenz `src/components/Bookings/LaundryOrderCard.tsx`

## Änderungen je Karte

### BookingCard
- `border-l-4 border-l-<color>` entfernen.
- Hintergrund (`bg-yellow-50`) auf neutrale Card-Oberfläche setzen, passend zu den anderen Listen (`bg-card`).
- Klassen wie bei `ClickableCard`/Gäste-Karten: weiche Hover-Schatten, `hover:border-primary/40`, abgerundete Ecken (Standard-Card-Radius bleibt erhalten, jetzt vollständig sichtbar).
- Optional: kleiner farbiger Punkt (`h-2 w-2 rounded-full bg-<colorVariant>`) neben Gastname, um die Gruppen-Verbindung zur zugehörigen Reinigung/Wäsche beizubehalten.
- Auf `ClickableCard` umstellen (ersetzt manuelles role/tabIndex/Keyboard-Handling).

### ServiceTaskCard
- `border-l-4 border-l-<color>` und `bg-blue-50` entfernen → neutrale Card-Oberfläche.
- Gleicher dezenter Farb-Akzent wie BookingCard (Punkt) zur Gruppen-Zuordnung.
- Bereits auf `ClickableCard` migriert — nur Styling anpassen.

### LaundryOrderCardWithStatus / LaundryOrderCard
- Analog: `border-l-4 …` und `bg-laundry-bg` entfernen, neutrale Card mit Hover-Effekt.
- Farb-Akzent als Punkt beibehalten.

## Was unverändert bleibt
- Status-Badges, Edit-Buttons, Inhalt und Layout der Karten.
- Filter, Datenfluss, Realtime-Channels in `ConnectedBookingView`.
- Tabellen-Ansicht `BookingOverviewFixed` (war ohnehin nicht im Scope dieser Karten-Refactorings).

## Offene Frage
Soll der **gelbe Hintergrund** der `BookingCard` komplett entfallen (so wie bei Gäste-Karten) oder als sehr dezenter Tönung (`bg-yellow-50/40`) bleiben, damit die Buchungskarte sich weiterhin von Reinigung/Wäsche unterscheidet?

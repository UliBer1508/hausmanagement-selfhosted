## Ziel
Die Buchungs-Übersicht (`BookingOverviewFixed.tsx`) bekommt **echte Karten** im Stil der Gäste-Liste statt der Tabelle mit Card-Optik.

## Umsetzung

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

1. **Tabelle ersetzen** (Zeile 858–977): `<Table>`-Block raus, statt­dessen vertikale Liste (`space-y-3`) aus `ClickableCard`-Komponenten — analog `GuestList.tsx`.
2. **Imports aufräumen:** `Table*`-Imports entfernen, `ClickableCard` aus `@/components/ui/clickable-card` ergänzen.
3. **Kartenlayout pro Buchung:**
   - **Header:** Gastname (`font-semibold text-lg`), Nationalität in Klammern, Status-Badge, Zahlungs-Badge.
   - **Haus:** als Sub-Zeile unter dem Namen (`text-sm text-muted-foreground`).
   - **Daten-Block:** Check-in / Check-out (mit `📅`), Gäste-Anzahl (mit `👥`, Erw./Ki.-Hinweis), Betrag (mit `💶`).
   - **Services & Wäsche:** als horizontale Chips/Inline-Liste (`getServiceInfo` / `getLinenInfo` weiterverwenden).
   - **Footer:** Action-Buttons (Bearbeiten, Löschen) rechts ausgerichtet, `e.stopPropagation()` beibehalten.
4. **Klickverhalten:** Karte → öffnet Edit-Dialog (wie heute Tabellenzeile). `ClickableCard` `onActivate` nutzen.
5. **Empty-State:** unverändert (bleibt unter der Liste).
6. **Filter-/Sortier-Card oben:** bleibt unangetastet.

## Visuelle Angleichung an Gäste-Karten
- `p-4`, `rounded-lg`, `hover:shadow-md` (kommt durch `ClickableCard`).
- Innenabstand: `space-y-3` zwischen Header / Daten / Services / Aktionen.
- Badges identisch zur Gäste-Liste-Optik (Stammgast/Status), bestehende `getStatusBadge` / `getPaymentStatusBadge` weiterverwenden.

## Was nicht geändert wird
- Keine Daten-Logik (Filter, Sortierung, Hooks, Delete-Flow, Auto-Open-Dialog).
- Keine Änderungen an `BookingCard.tsx`, `GuestList.tsx`, oder anderen Modulen.
- Spalten-Sortier-Header entfallen (Tabelle weg) — Sortierung weiter über die Filter-Leiste oben.

## Verifikation
- Preview öffnen, Buchungen-Tab prüfen: Karten sehen aus wie Gäste-Karten, Klick öffnet Edit, Buttons funktionieren, Filter wirken.
## Ziel
Auf der `BookingCard` ein kleines Badge anzeigen, das die Gast-Kategorie zeigt: **Stammgast** oder **Neuer Gast** – mit derselben Logik und demselben Styling wie in der Gästeliste.

## Logik (bereits vorhanden, wird wiederverwendet)
In `useGuests.ts`:
- `stay_count >= 2` ⇒ `returning` (Stammgast)
- sonst ⇒ `new` (Neuer Gast)

Quelle: aggregierte Buchungen mit Status `confirmed`, `checked_in`, `completed`, gruppiert per `guest_email` (Fallback `guest_id`).

## Umsetzung

### 1. Neuer Hook `src/hooks/useGuestStayCounts.ts`
- Lädt einmalig (React-Query, `staleTime 5min`) alle relevanten Buchungen.
- Gibt eine `Map<email, stayCount>` zurück.
- Helper `getGuestCategory(booking) → 'new' | 'returning'`:
  - Zählt aktuelle Buchung ab, damit eine erste Buchung nicht fälschlich als Stammgast erscheint.

### 2. `src/components/Bookings/BookingCard.tsx` anpassen
- Hook nutzen, Kategorie ermitteln.
- Badge direkt neben den Gastnamen setzen, identisches Styling wie `GuestList.tsx`:
  - Stammgast: `bg-green-100 text-green-800`
  - Neuer Gast: `bg-blue-100 text-blue-800`
- Während Laden: kein Badge.

## Betroffene Dateien
- **neu:** `src/hooks/useGuestStayCounts.ts`
- **edit:** `src/components/Bookings/BookingCard.tsx`

Keine weiteren Änderungen.

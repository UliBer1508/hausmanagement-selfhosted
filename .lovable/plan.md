## Problem
Reinigungskarte (`ServiceTaskCard`) im Übersicht-Tab zeigt keinen Gastnamen, obwohl der Render-Code bereits vorhanden ist:

```tsx
{task.bookings && ( ...getGuestName(task.bookings)... )}
```

Ursache: Die Query, die der Übersicht-Tab nutzt (`['dashboard-service-tasks']` in `src/pages/OriginalDashboard.tsx`, Zeile 601–632), lädt nur `booking_id` — die `bookings`-Relation fehlt. Damit ist `task.bookings` undefined und der Gast-Block rendert nie.

Die parallele Query in `ConnectedBookingView.tsx` lädt die Relation bereits korrekt — deshalb funktioniert die Anzeige in der Buchungsseite, aber nicht im Übersicht-Tab.

## Lösung — eine Datei, minimal-invasiv

**Datei:** `src/pages/OriginalDashboard.tsx` (Query `['dashboard-service-tasks']`, ab Zeile 606)

Im `.select(...)` die `bookings`-Relation analog zu `ConnectedBookingView` ergänzen:

```ts
.select(`
  id,
  status,
  scheduled_date,
  service_type,
  notes,
  booking_id,
  house_id,
  provider_id,
  status_changed_by,
  status_changed_at,
  service_providers!service_tasks_provider_id_fkey (
    id, name, service_type, contact_email, contact_phone
  ),
  bookings:booking_id (
    id,
    guest_name,
    check_in,
    check_out,
    number_of_guests,
    guests (*)
  )
`)
```

Keine Änderung an `ServiceTaskCard.tsx` nötig — der Render-Code ist bereits korrekt und fällt sauber zurück, wenn `task.bookings` null ist (Reinigungen ohne Buchung).

## Abnahme
- Reinigungskarte in der Übersicht zeigt „Gast: Dot Shaw (3)" und Buchungszeitraum, identisch zur Wäschekarte derselben Zeile.
- Reinigungen ohne verknüpfte Buchung rendern weiterhin ohne Gast-/Buchungszeile.
- Verhalten auf der Buchungsseite und in der Reinigungsverwaltung bleibt unverändert.
- Build grün.

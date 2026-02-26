

# Test-User "Loveable" und Buchung löschen

## Gefundene Daten

| Typ | ID | Details |
|-----|-----|---------|
| Guest | `cf76c1d9-9b81-4ccd-9b5f-4dd3d26599c1` | Name: "Loveable", Email: uli.berresheim@hotmail.de |
| Booking | `358dc9ca-9a9c-411b-8427-e266780537e7` | 15.–17.01.2024, Status: completed, Test-Buchung |
| App Review | `188bc85f-1e3a-466c-84a6-65552b62412d` | Verknüpft mit der Buchung |

Keine verknüpften service_tasks, linen_orders oder guest_app_sessions vorhanden. Der Guest hat nur diese eine Buchung.

## Lösch-Reihenfolge (wegen Foreign Keys)

1. **App Review** -- `booking_id` referenziert die Buchung, muss zuerst gelöscht werden
2. **Booking** -- `guest_id` referenziert den Guest
3. **Guest** -- kann zuletzt gelöscht werden

## Technische Umsetzung

Eine SQL-Migration mit drei DELETE-Statements:

```sql
-- 1. App Review löschen (referenziert booking)
DELETE FROM app_reviews WHERE booking_id = '358dc9ca-9a9c-411b-8427-e266780537e7';

-- 2. Test-Buchung löschen
DELETE FROM bookings WHERE id = '358dc9ca-9a9c-411b-8427-e266780537e7';

-- 3. Test-Guest löschen
DELETE FROM guests WHERE id = 'cf76c1d9-9b81-4ccd-9b5f-4dd3d26599c1';
```

Zusatzlich wird die Edge Function `create-loveable-test-booking` gelöscht, da sie nicht mehr gebraucht wird.




# Test User "Test User" und Buchung löschen

## Gefundene Daten

| Typ | ID | Details |
|-----|-----|---------|
| Guest | `aec3f0aa-26d4-48ad-bc2e-1865e1afc279` | Name: "Test User" |
| Booking | `35006594-9daf-421b-abfb-1faf73f5003f` | 24.02.–01.03.2026, Status: confirmed |
| Guest App Session | `b9cb3801-9bd1-4536-aaa2-e0cce950dad2` | Leere Session (keine Events) |

Keine weiteren verknüpften Daten (keine service_tasks, linen_orders, app_reviews).

## Lösch-Reihenfolge (wegen Foreign Keys)

1. **Guest App Session** -- referenziert booking_id
2. **Booking** -- referenziert guest_id
3. **Guest** -- kann zuletzt gelöscht werden

## SQL

```sql
-- 1. Leere Guest App Session löschen
DELETE FROM guest_app_sessions WHERE id = 'b9cb3801-9bd1-4536-aaa2-e0cce950dad2';

-- 2. Test-Buchung löschen
DELETE FROM bookings WHERE id = '35006594-9daf-421b-abfb-1faf73f5003f';

-- 3. Test-Guest löschen
DELETE FROM guests WHERE id = 'aec3f0aa-26d4-48ad-bc2e-1865e1afc279';
```


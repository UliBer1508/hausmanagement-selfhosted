

# Datenkorrektur: Anonyme Session mit Buchung verknüpfen

## Problem

Die Guest App Session `guest-1769938619117-guchy7x` ist anonym, obwohl sie zu Oliver Grandt's aktiver Buchung gehört.

## Zu korrigierende Daten

**Tabelle:** `guest_app_sessions`

| Feld | Aktuell | Korrektur |
|------|---------|-----------|
| `booking_id` | `NULL` | `6566bff6-d6bd-4beb-9f68-eb21e2242459` |
| `guest_name` | `NULL` | `Oliver Grandt` |
| `guest_email` | `NULL` | `Vicielisa97@icloud.com` |

## SQL Update

```sql
UPDATE guest_app_sessions
SET 
  booking_id = '6566bff6-d6bd-4beb-9f68-eb21e2242459',
  guest_name = 'Oliver Grandt',
  guest_email = 'Vicielisa97@icloud.com',
  updated_at = now()
WHERE session_id = 'guest-1769938619117-guchy7x';
```

## Erwartetes Ergebnis

Nach der Korrektur:
- Die Session erscheint in der Gäste-Tracking-Liste als "Oliver Grandt" statt "Anonym"
- Der Gast kann die Guest App normal nutzen
- Die Aktivitäten werden korrekt mit der Buchung verknüpft

## Wichtiger Hinweis

Dies ist eine einmalige Datenkorrektur. Die Ursache (Guest App sucht nur nach `status = 'confirmed'`) muss separat in der Guest App behoben werden, damit zukünftige Identifikationen für `checked_in` Buchungen funktionieren.


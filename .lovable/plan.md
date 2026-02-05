# Guest App: Buchungs-Identifikation für alle aktiven Status

## Anforderung

Die Guest App muss Gäste korrekt identifizieren können, unabhängig davon ob:
1. **Check-in noch bevorsteht** (`status = 'confirmed'`) - Gast gibt Check-in Datum an
2. **Gast bereits eingecheckt ist** (`status = 'checked_in'`)
3. **Aufenthalt abgeschlossen** (`status = 'completed'`) - für Bewertungen/Historie

## Aktuelle Situation

Die Identifikationslogik in der Guest App sucht möglicherweise nur nach `status = 'confirmed'`, was dazu führt dass eingecheckte Gäste (`checked_in`) nicht erkannt werden.

## Erforderliche Änderung (Guest App)

```typescript
// In der Guest App Identifikationslogik ändern:

// VON (einschränkend):
.eq('status', 'confirmed')

// ZU (alle aktiven Buchungen):
.in('status', ['confirmed', 'checked_in', 'completed'])
```

## Matching-Kriterien

Die Identifikation sollte matchen wenn:
- `check_in` Datum übereinstimmt mit der Angabe des Gastes
- ODER `guest_email` übereinstimmt (falls Gast Email eingibt)
- UND `status` IN ('confirmed', 'checked_in', 'completed')

## Datenbankstruktur

Die `guest_app_sessions` Tabelle speichert nach erfolgreicher Identifikation:
- `booking_id` → Link zur Buchung
- `guest_name` → Name des Gastes  
- `guest_email` → Email des Gastes

## Hinweis

Diese Änderung muss in der **separaten Guest App** implementiert werden, nicht im Management-System.

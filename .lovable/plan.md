

# Fix: Guest App Buchungssuche muss auch `checked_in` Status berücksichtigen

## Problem

Oliver Grandt kann sich nicht identifizieren, weil:
1. Seine Buchung hat Status `checked_in` (bereits eingecheckt)
2. Die Guest App sucht wahrscheinlich nur nach `status = 'confirmed'`
3. Ergebnis: Keine passende Buchung gefunden → Identifikation schlägt fehl

## Betroffene Buchungs-Status

| Status | Anzahl | Soll identifizierbar sein? |
|--------|--------|---------------------------|
| `confirmed` | 21 | ✓ Ja |
| `checked_in` | 2 | ✓ Ja (Oliver Grandt!) |
| `completed` | 79 | ✓ Ja (laut Session-Policy) |
| `cancelled` | 7 | ✗ Nein |

## Lösung für Guest App

Die Buchungssuche in der Guest App muss angepasst werden:

### Aktuell (vermutlich)
```typescript
.eq('status', 'confirmed')
```

### Korrigiert
```typescript
.in('status', ['confirmed', 'checked_in', 'completed'])
```

Oder alternativ:
```typescript
.neq('status', 'cancelled')
```

## Prompt für Guest App

Die Gast-Identifikation muss alle aktiven Buchungsstatus berücksichtigen:

```typescript
// Bei der Buchungssuche für Identifikation:
const { data: bookings } = await supabase
  .from('bookings')
  .select(`
    id,
    guest_name,
    guest_email,
    check_in,
    check_out,
    house_id,
    houses:house_id (name)
  `)
  .in('status', ['confirmed', 'checked_in', 'completed']) // NICHT nur 'confirmed'!
  .gte('check_out', new Date().toISOString()) // Noch nicht abgereist
  // ... weitere Filter (Name/Email-Match)
```

## Zusammenfassung

| Änderung | Ort |
|----------|-----|
| Buchungsstatus-Filter erweitern | Guest App - Identifikationslogik |
| Keine Änderungen | Management App (dieses Projekt) |

Die Änderung muss in der **Guest App** erfolgen, nicht hier.


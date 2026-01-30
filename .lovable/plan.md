
# Anpassung Guest App Tracking: Email nur über Relationen

## Zusammenfassung

Die Email-Daten werden aktuell redundant in mehreren Tabellen gespeichert (`guest_app_sessions`, `guest_saved_activities`, `app_reviews`, etc.). Die Anpassung soll die Email ausschließlich aus der `guests`-Tabelle über die Beziehungskette laden.

---

## Aktuelle Situation

### Datenbank-Analyse

| Tabelle | Hat guest_email | Hat booking_id | Kann über Relation laden |
|---------|-----------------|----------------|-------------------------|
| `guest_app_sessions` | Ja (redundant) | Ja | Ja - via bookings.guest_id → guests.email |
| `guest_saved_activities` | Ja (NOT NULL) | Ja | Ja - via booking_id |
| `app_reviews` | Ja (NOT NULL) | Ja (NOT NULL) | Ja - via booking_id |
| `guest_preference_responses` | Ja (NOT NULL) | Ja | Ja - via booking_id |

### Beziehungskette
```text
guest_app_sessions.booking_id
     ↓
  bookings.guest_id
     ↓
  guests.email (authoritative)
```

### Beispiel aus der Datenbank
Die Query zeigt, dass die Email über die Relation verfügbar ist:
- Session mit `booking_id` hat Zugriff auf `guests.email` via `bookings.guest_id`

---

## Geplante Änderungen

### 1. useGuestAppTracking.ts - Sessions Query erweitern

**Datei:** `src/hooks/useGuestAppTracking.ts`

**Änderung:** Die `useGuestAppSessions` Query erweitern, um die Email über die guests-Tabelle zu laden:

```typescript
// VORHER (Zeile 112-125):
.select(`
  *,
  bookings:booking_id (
    guest_name,
    check_in,
    check_out,
    house_id,
    houses:house_id (
      name
    )
  )
`)

// NACHHER:
.select(`
  *,
  bookings:booking_id (
    guest_name,
    guest_email,
    check_in,
    check_out,
    house_id,
    guest_id,
    houses:house_id (
      name
    ),
    guests:guest_id (
      name,
      email
    )
  )
`)
```

### 2. GuestAppSession Interface erweitern

**Datei:** `src/hooks/useGuestAppTracking.ts`

```typescript
// Interface erweitern (Zeile 5-25):
export interface GuestAppSession {
  // ... bestehende Felder
  
  // Neue Felder aus der Relation
  booking_guest_email?: string;  // aus bookings.guest_email (Fallback)
  guest_table_email?: string;    // aus guests.email (authoritative)
  guest_table_name?: string;     // aus guests.name
}
```

### 3. Daten-Transformation anpassen

**Datei:** `src/hooks/useGuestAppTracking.ts`

Die Transformation erweitern, um die Email bevorzugt aus der guests-Tabelle zu laden:

```typescript
// Zeile 156-169 anpassen:
const sessions = (data || []).map((session: Record<string, unknown>) => {
  const booking = session.bookings as Record<string, unknown> | null;
  const house = booking?.houses as Record<string, string> | null;
  const guest = booking?.guests as Record<string, string> | null;
  
  // Email-Priorität: guests-Tabelle > bookings > session (legacy)
  const resolvedEmail = guest?.email || 
                        (booking?.guest_email as string) || 
                        (session.guest_email as string);
  
  // Name-Priorität: guests-Tabelle > bookings > session (legacy)
  const resolvedName = guest?.name || 
                       (booking?.guest_name as string) || 
                       (session.guest_name as string);
  
  return {
    ...session,
    // Überschreibe die Session-Email mit der autoritativen Quelle
    guest_email: resolvedEmail,
    guest_name: resolvedName,
    booking_guest_name: booking?.guest_name as string | undefined,
    booking_guest_email: booking?.guest_email as string | undefined,
    guest_table_email: guest?.email,
    guest_table_name: guest?.name,
    check_in: booking?.check_in as string | undefined,
    check_out: booking?.check_out as string | undefined,
    house_id: booking?.house_id as string | undefined,
    house_name: house?.name,
  } as GuestAppSession;
});
```

### 4. Stats-Query anpassen

**Datei:** `src/hooks/useGuestAppTracking.ts`

Die Stats-Query muss angepasst werden, um "identifizierte Gäste" über die Relation zu zählen:

```typescript
// Zeile 313-316 ändern:
// VORHER:
let sessionsQuery = supabase
  .from('guest_app_sessions')
  .select('user_agent, guest_email, completed_onboarding');

// NACHHER:
let sessionsQuery = supabase
  .from('guest_app_sessions')
  .select(`
    user_agent, 
    guest_email, 
    completed_onboarding,
    booking_id,
    bookings:booking_id (
      guest_id,
      guests:guest_id (
        email
      )
    )
  `);

// Zeile 330 anpassen:
// VORHER:
const identifiedGuests = sessions.filter(s => s.guest_email !== null).length;

// NACHHER:
const identifiedGuests = sessions.filter(s => {
  const guestEmail = (s.bookings as any)?.guests?.email || s.guest_email;
  return guestEmail !== null;
}).length;
```

---

## Keine Änderungen erforderlich

Die folgenden Komponenten benötigen **keine direkten Änderungen**, da sie die Daten aus dem Hook erhalten:

- `GuestSessionDetail.tsx` - Nutzt bereits `session.guest_email` (wird jetzt aus Relation befüllt)
- `GuestAppTracking.tsx` - Zeigt Sessions an (keine Email-Anzeige in der Liste)

---

## Technische Details

### Fallback-Strategie

Da alte Sessions möglicherweise keine `booking_id` haben, implementieren wir eine Fallback-Kette:

1. **Priorität 1:** `guests.email` (über `bookings.guest_id`)
2. **Priorität 2:** `bookings.guest_email` (Legacy-Feld)
3. **Priorität 3:** `guest_app_sessions.guest_email` (historische Daten)

### Datenkonsistenz

Die bestehenden redundanten Daten in `guest_app_sessions` werden **nicht gelöscht**, aber:
- Neue Daten werden bevorzugt aus der `guests`-Tabelle geladen
- Bei Änderungen am Gast (z.B. Email-Korrektur) wird automatisch die richtige Email angezeigt

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/hooks/useGuestAppTracking.ts` | Query erweitern, Interface anpassen, Transformation mit Fallback |

---

## Separate Aufgabe: Guest App (andere App)

Die eigentliche Datenerfassung findet in der **Guest App** statt. Dort muss ebenfalls angepasst werden:
- Beim Session-Upsert: `guest_email` nicht mehr direkt speichern
- Stattdessen nur `booking_id` setzen
- Die Email über die Relation laden

Der Prompt für die Guest App wurde bereits im vorherigen Chat erstellt.

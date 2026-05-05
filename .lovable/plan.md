## Problem

`useDeleteBooking()` in `src/hooks/useBookings.ts` führt drei sequenzielle Supabase-Calls aus:

1. `DELETE FROM service_tasks WHERE booking_id = ?`
2. `DELETE FROM linen_orders WHERE booking_id = ?`
3. `DELETE FROM bookings WHERE id = ?`

Schlägt Schritt 2 oder 3 fehl, sind die Reinigungsaufträge bereits gelöscht — die Buchung bleibt aber bestehen. **Inkonsistenter Zustand.** Außerdem existieren weitere Tabellen mit `booking_id` (z. B. `guest_preferences`, `app_reviews`, `booking_activities`, `blocked_bookings`, `ical_preview_edits` usw.), die aktuell beim Löschen einer Buchung **gar nicht aufgeräumt** werden — das kann zu Orphan-Records führen.

DB-Check zeigt: Es gibt **keine FK-Constraints mit ON DELETE CASCADE** auf `bookings`, daher muss die Cleanup-Logik explizit erfolgen.

## Lösung

Eine **Postgres RPC-Funktion** `delete_booking_cascade(p_booking_id uuid)` erstellen. Funktionen in Postgres laufen automatisch in einer Transaktion — schlägt ein Statement fehl, wird die gesamte Operation zurückgerollt. Atomar, einfach, kein Edge-Function-Overhead.

### Schritt 1 — DB-Migration

```sql
CREATE OR REPLACE FUNCTION public.delete_booking_cascade(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reihenfolge: erst alle Kind-Datensätze, dann die Buchung
  DELETE FROM public.service_tasks                WHERE booking_id = p_booking_id;
  DELETE FROM public.linen_orders                 WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_preferences            WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_preference_responses   WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_app_sessions           WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_app_events             WHERE booking_id = p_booking_id;
  DELETE FROM public.guest_saved_activities       WHERE booking_id = p_booking_id;
  DELETE FROM public.booking_activities           WHERE booking_id = p_booking_id;
  DELETE FROM public.activity_recommendations     WHERE booking_id = p_booking_id;
  DELETE FROM public.recommendation_feedback      WHERE booking_id = p_booking_id;
  DELETE FROM public.app_reviews                  WHERE booking_id = p_booking_id;
  DELETE FROM public.trip_plans                   WHERE booking_id = p_booking_id;
  DELETE FROM public.saved_trip_plans             WHERE booking_id = p_booking_id;
  DELETE FROM public.ical_preview_edits           WHERE booking_id = p_booking_id;
  DELETE FROM public.blocked_bookings             WHERE booking_id = p_booking_id;
  DELETE FROM public.booking_action_tracking      WHERE booking_id = p_booking_id;

  DELETE FROM public.bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buchung % nicht gefunden', p_booking_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_booking_cascade(uuid) TO anon, authenticated, service_role;
```

Falls beliebige `DELETE`-Statement fehlschlägt (FK, Permission, etc.), rollt Postgres die komplette Funktion zurück — alle Aufräum-Operationen sind atomar.

### Schritt 2 — Frontend `useDeleteBooking`

```ts
mutationFn: async (id: string) => {
  const { error } = await supabase.rpc('delete_booking_cascade', {
    p_booking_id: id,
  });
  if (error) throw error;
},
```

Die drei sequenziellen Aufrufe entfallen vollständig. `onSuccess`-Invalidations bleiben unverändert.

### Schritt 3 — Type-Regeneration

Nach der Migration werden die generierten Supabase-Types automatisch aktualisiert, sodass `supabase.rpc('delete_booking_cascade', ...)` getypt verfügbar ist.

## Vorteile

- **Atomar**: Alles oder nichts — keine Inkonsistenzen mehr.
- **Vollständig**: Alle bekannten Child-Tabellen mit `booking_id` werden mit aufgeräumt (vorher nur 2 von 16).
- **Schneller**: Ein Round-Trip statt drei.
- **Wartbar**: Neue Child-Tabellen ergänzt man an einer einzigen Stelle (Migration).

## QA

- Buchung mit zugehöriger Reinigung & Wäschebestellung anlegen → löschen → prüfen, dass alle drei weg sind.
- Buchung ohne Children löschen → muss ebenfalls funktionieren.
- Nicht-existente ID löschen → klare Fehlermeldung.
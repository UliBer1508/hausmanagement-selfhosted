## Problembefund

Für die Buchung **Dot Shaw / Wald Chalet (20.06.2026)** existiert in der Datenbank eine Wäschebestellung (`linen_orders.id = 5b4e4e71-…`, Status `offen`, erstellt am 11.05.2026 10:42 UTC). Sie ist korrekt mit `booking_id` verknüpft, das Haus hat `rental_type='tourist'`, und es gibt keine RLS-Blockade.

Die Bestellung wird im Tab **„Übersicht"** trotzdem nicht angezeigt — die Karte zeigt „Keine Wäschebestellungen".

### Ursache

Der Übersichts-Tab (`src/pages/OriginalDashboard.tsx`, Zeile 687–712) lädt die Wäschebestellungen über React-Query mit dem Key `['dashboard-linen-orders', 'tourist']` und `staleTime: 5 * 60 * 1000`.

Dieser Query hat **keine Realtime-Subscription** und wird **nicht invalidiert**, wenn anderswo (z. B. Tab „Buchungen" / `ConnectedBookingView`, Tab „Wäsche", Edge-Function `auto-create-linen-orders`, externer Sync) eine neue Bestellung entsteht. Die Übersicht zeigt deshalb bis zu 5 Minuten lang einen veralteten Stand bzw. bis zum manuellen Reload gar nichts.

`ConnectedBookingView` hat exakt diese Subscription bereits (Zeile 40–95) und zeigt die Bestellung dort sichtbar. Im Übersichts-Tab fehlt das Pendant.

Analoge Lücke besteht für `service_tasks` (Key `service_tasks`) und `bookings` (Key `dashboard-bookings`), die im selben Tab angezeigt werden.

## Lösung

In `src/pages/OriginalDashboard.tsx` einen `useEffect` mit Supabase-Realtime-Channels hinzufügen, der die drei relevanten Query-Keys invalidiert, sobald sich die jeweiligen Tabellen ändern. Das spiegelt das Muster aus `ConnectedBookingView` und sorgt für sofortige Aktualisierung der Übersicht.

Konkret:

1. **Channel `dashboard-linen-orders-realtime`** auf Tabelle `linen_orders` (Event `*`) → invalidiert `['dashboard-linen-orders', 'tourist']`.
2. **Channel `dashboard-service-tasks-realtime`** auf Tabelle `service_tasks` → invalidiert den Service-Tasks-Query.
3. **Channel `dashboard-bookings-realtime`** auf Tabelle `bookings` → invalidiert den Bookings-Query.
4. Cleanup über `supabase.removeChannel(...)` in der Return-Funktion.
5. Subscription nur einmal beim Mount; `queryClient` als Dependency.

Keine Änderungen an Datenbank, RLS oder Geschäftslogik. Nur Frontend-Refresh.

## Technische Details

- Datei: `src/pages/OriginalDashboard.tsx` (neuer `useEffect` nahe den existierenden Query-Hooks).
- Nutzt vorhandenes `useQueryClient()` (bereits importiert oder über `@tanstack/react-query` ergänzen, falls nicht vorhanden).
- Query-Keys exakt wie in den bestehenden `useQuery`-Aufrufen verwenden, damit `invalidateQueries` matcht.
- Kein Polling, keine Reduzierung der `staleTime` nötig — Realtime ist effizienter.

## Verifikation

Nach dem Fix:
- Übersicht im Browser öffnen → Karte für Dot Shaw zeigt die existierende Bestellung (5 Bettwäsche, 2 Spannbetttuch etc.) statt „Keine Wäschebestellungen".
- Neue Bestellung in einem anderen Tab anlegen → erscheint ohne Reload sofort in der Übersicht.

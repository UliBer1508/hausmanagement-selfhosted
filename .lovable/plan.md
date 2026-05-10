## Befund: Beide Mechanismen existieren bereits

### 1. Bearbeitungsstatus-Abfrage — vorhanden
- **Hook:** `src/hooks/useExternalOrderStatus.ts`
  - `useExternalOrderStatus(bestellnummer)` (Einzel)
  - `useExternalOrdersStatus(bestellnummern[])` (Batch)
  - `getExternalStatusBadgeInfo(status)` → fertige Badges für `neu`, `in_bearbeitung`, `ausgeliefert`, `abgeholt`, `abgeschlossen`, `storniert`
- **Mechanismus:** Direkter Lesezugriff via `externalLaundryClient` auf die externe Supabase
  - Tabelle `waeschebestellungen` (`status`)
  - Tabelle `bestellpositionen` + `waescheartikel.preis` (Gesamtpreis)
- **Aktive Verwendung:** nur in `src/components/ServicePortal/LaundryOrdersOverview.tsx`
- **Nicht verwendet** in der Hauptapp (`LaundryOrderCard`, `BookingOverviewFixed`, Wäsche-Management) — dort wird nur das statische grüne „Sync"-Badge gezeigt.

### 2. Rechnungs-Übertragung — vorhanden
- **Edge Function:** `supabase/functions/sync-laundry-invoices/index.ts`
  - Liest `rechnungen` (+ `rechnungspositionen`) aus externer Supabase, gefiltert auf `kunde_kundennummer = K470214`
  - Upsert in lokale `laundry_invoices` (lokaler `status`/`bezahlt_am` bleibt erhalten)
- **Hook:** `useSyncLaundryInvoices` in `src/hooks/useLaundryInvoices.ts` (ruft `supabase.functions.invoke('sync-laundry-invoices')` auf)
- **Aktive Verwendung:** `src/components/ServicePortal/LaundryInvoicesList.tsx` (manueller „Synchronisieren"-Button)
- Funktioniert produktiv (siehe Memory `features/teuni-invoice-synchronization`).

## Vorschlag: Nur Lückenschluss, keine Neuentwicklung

### A. Status-Badge in der Hauptapp aktivieren
1. In den Listen, die `LaundryOrderCard` rendern, alle `external_bestellnummer` einsammeln und einmal `useExternalOrdersStatus(bestellnummern)` aufrufen:
   - `BookingOverviewFixed` (Wäschebestellungen pro Buchung)
   - zentrale Wäsche-Übersicht der Hauptapp (sofern dort Cards stehen)
2. `LaundryOrderCard` um optionalen Prop `externalStatus?: { status, totalPrice }` erweitern.
3. Wenn vorhanden: zusätzliches Badge via `getExternalStatusBadgeInfo` neben dem bestehenden „Sync"-Badge anzeigen, mit Tooltip (Bestellnummer + Portal-Preis).
4. Auto-Refresh: `refetchInterval: 60_000` solange noch offene Status (`neu`, `in_bearbeitung`) existieren — sonst kein Polling.

### B. Rechnungssync auch außerhalb des ServicePortals zugänglich machen (optional)
- In der Hauptapp-Wäscheübersicht denselben „Rechnungen synchronisieren"-Button anbieten (nutzt `useSyncLaundryInvoices`, keine Codeänderung am Backend).
- Cron/Automatik nur, falls gewünscht — derzeit bewusst manuell.

## Was **nicht** gebraucht wird
- ❌ Neue Edge Function (Status oder Rechnung)
- ❌ Schemaänderungen
- ❌ Schreibzugriff aufs externe Portal

## Offene Frage
Soll der lokale `linen_orders.status` automatisch nachgezogen werden, sobald der Portal-Status `abgeschlossen` ist (einmaliger UPDATE mit `status_changed_by = 'oberpinzgau-portal'`), oder rein lesend angezeigt werden?

## Ziel

Umstellung der Wäsche-Oberpinzgau-Synchronisation vom **direkten DB-Zugriff** (Supabase JS-SDK gegen externe DB) auf den **offiziellen REST-Endpoint** `POST /functions/v1/external-order-import` mit Bearer-Token-Auth — bei voller Funktionsgleichheit, persistentem Logging und Retry.

## Architektur (neu)

```text
┌────────────────────┐
│  UI / Auto-Sync    │
│  LaundryOrderCard  │
│  Status→Ausstehend │
└─────────┬──────────┘
          │ syncOrder(linenOrderId)
          ▼
┌─────────────────────────────────┐
│  useExternalSync.ts (refactor)  │
│  - lädt Order + Mapping         │
│  - ruft Edge Function auf       │
└─────────┬───────────────────────┘
          │ supabase.functions.invoke
          ▼
┌──────────────────────────────────────────┐
│  Edge Function:                          │
│  sync-linen-order-rest                   │
│  - baut Spec-konformen JSON-Body         │
│  - POST → external-order-import          │
│  - Retry (3× exponential bei 5xx)        │
│  - schreibt linen_sync_log               │
│  - updated linen_orders                  │
└─────────┬────────────────────────────────┘
          │ HTTPS POST + Bearer
          ▼
   Oberpinzgau Laundry Hub REST-API
```

## Arbeitspakete

### 1. Secret + Settings (DB-Migration + Insert)
- Neues Secret `EXTERNAL_LAUNDRY_BEARER_TOKEN` (Lovable Cloud, vom Portal-Betreiber).
- Spalte ergänzen in `linen_automation_settings`:
  - `sync_transport` TEXT DEFAULT `'rest'` (Werte: `'rest' | 'db'`) — erlaubt Cutover & Fallback.
  - `sync_max_retries` INT DEFAULT `3`.
- Default-Werte für `external_lieferzeit` (`'08:00'`) und `external_abholzeit` (`'10:00'`) in `system_settings` ergänzen (oder bereits vorhandene Felder wiederverwenden).

### 2. Logging-Tabelle (DB-Migration)
Neue Tabelle `linen_sync_log`:
- `linen_order_id` (FK), `transport` (`rest`/`db`), `attempt` (int), `request_payload` (jsonb), `response_status` (int), `response_body` (jsonb), `error_message` (text), `success` (bool), `created_at`.
- Index auf `linen_order_id` und `created_at`.

### 3. Neue Edge Function `sync-linen-order-rest`
- Input: `{ linen_order_id }`.
- Lädt: `linen_orders` + `houses` + `bookings` + `external_article_mapping` + `linen_automation_settings` + ggf. `system_settings`.
- Validierung: `external_objektnummer` vorhanden, Status = `ausstehend`, noch nicht gesynced, ≥1 mappbare Position.
- **Body-Aufbau gem. Spec** (alle optionalen Felder soweit verfügbar): `kundennummer`, `objektnummer`, `gastname`, `check_in`, `check_out`, `anzahl_personen`, `lieferdatum`, `abholdatum` (= `check_out`), `lieferzeit`, `abholzeit`, `notizen`, `prioritaet` (default 0), `positionen[{artikelnummer, menge, notizen?}]`.
- Farbvarianten-Mapping wie heute (`itemKey__color` → `external_artikelnummer`).
- POST mit `Authorization: Bearer ${EXTERNAL_LAUNDRY_BEARER_TOKEN}`.
- **Retry**: bei 5xx / Netzwerkfehler 3 Versuche, Backoff 2 s / 8 s / 30 s. Bei 4xx kein Retry.
- Bei Erfolg (201): schreibt `external_bestellnummer`, `external_synced_at` in `linen_orders`, Log-Eintrag `success=true`.
- Bei Fehler: Log-Eintrag mit `response_status` + `error` + `message` aus Body, Order bleibt unsynced.
- CORS-Header, JWT-Validierung im Code.

### 4. Refactor `useExternalSync.ts`
- DB-Direktzugriff entfernen.
- `syncOrder(id)` ruft `supabase.functions.invoke('sync-linen-order-rest', { body: { linen_order_id: id } })`.
- Bei `sync_transport === 'db'`: alter Pfad als Fallback (während Pilotphase). Nach Cutover entfernen.
- Toast-Verhalten unverändert.

### 5. Auto-Sync-Trigger
- Bestehender Trigger (Status → "ausstehend") ruft die neue Edge Function (statt Hook) — falls aktuell client-getriggert, bleibt es im Hook.

### 6. UI-Erweiterungen (LaundryOrderCard / Settings)
- Sync-Status-Badge mit letzten Fehlern aus `linen_sync_log` (Tooltip).
- "Erneut versuchen"-Button bei fehlgeschlagenem Sync.
- Settings-Card: Toggle "REST" vs "DB-Direktzugriff (Legacy)" für Cutover.
- Settings-Felder für `lieferzeit`/`abholzeit`/`prioritaet` Defaults.

### 7. Cleanup
- Alte Edge Function `sync-linen-order-external` löschen (war ungenutzt, hatte zudem den `bestellnummer`-Bug).
- `externalLaundryClient` / Anon-Key behalten **nur** für Lese-Operationen (z. B. Status-Sync), dokumentieren.

### 8. Test- & Pilotphase
- **Sandbox-Test**: 1 Test-Bestellung aus DB-Wert mit fiktiven Daten gegen Endpoint posten — alle Fehlercodes (400/401/404) provozieren und Logging prüfen.
- **Schattenbetrieb 7 Tage**: für 1 Haus REST-Sync aktiv, DB-Pfad parallel deaktiviert; Vergleich der eingegangenen Bestellungen im Portal.
- **Cutover**: `sync_transport='rest'` global, alten Pfad aus Hook entfernen.

## Voraussetzungen vom Nutzer

1. **Bearer-Token** vom Portal-Betreiber → wird via Secret-Tool angefragt.
2. **Bestätigung der Artikelnummern**: Spec-Beispiel nutzt `A0001`, unsere Mappings `WA001`. Vor Go-Live einmaliger Abgleich der 25 Mapping-Einträge.
3. **Bestätigung der Kundennummer** (`K0001` vs `K470214`).

## Aufwandsschätzung

| Paket | h |
|---|---|
| Secret + Settings-Migration | 0,5 |
| `linen_sync_log` Tabelle | 0,5 |
| Edge Function `sync-linen-order-rest` (inkl. Retry) | 3,5 |
| Refactor Hook + Fallback-Switch | 1,5 |
| UI (Status-Badge, Retry-Button, Settings) | 2 |
| Tests (Sandbox + Schatten) | 2 |
| Cleanup alte Function + Doku | 1 |
| **Gesamt** | **~11 h** |

## Risiken & Gegenmaßnahmen

- **Artikelnummern-Mismatch (404)** → Pre-Flight-Check pro Mapping-Eintrag in der Settings-UI mit Health-Endpoint (oder Trockenlauf einer Bestellung).
- **Token-Rotation** → über `update_secret`-Tool, kein Code-Deploy nötig.
- **Fallback** über `sync_transport`-Schalter, falls Endpoint instabil.

## Deliverables

- 2 neue DB-Migrationen, 1 neue Edge Function, refaktorierter Hook, 2 UI-Erweiterungen, gelöschte Legacy-Function, aktualisierte Doku `docs/Waesche-Oberpinzgau-Sync.md`.
## Analyse des SQL-Scripts

Das Script ist bereits 1:1 in der DB ausgeführt — alle 5 Tabellen (`properties`, `nightly_rates`, `local_events`, `market_data_cache`, `pricing_logs`) und die Funktion `update_dynamic_price` existieren. Es gibt aber **Konflikte mit dem bestehenden System**:

| Problem | Begründung |
|---|---|
| `properties` dupliziert `houses` | Wir verwalten Häuser bereits in `houses` (mit Adresse, max_guests, base_price etc.). Eine Parallel-Tabelle führt zu Datendrift. |
| `nightly_rates` dupliziert `daily_pricing` | Die App schreibt heute (DynamicPricingPanel `handleAccept`) in `daily_pricing` mit `house_id`. `nightly_rates` würde nie befüllt. |
| `update_dynamic_price` nutzt `properties.id` | Funktion ist unbrauchbar, solange wir `house_id` referenzieren. |
| RLS-Policies aktiv | Projektregel: keine RLS während Entwicklung. Außerdem hat das Projekt aktuell keine Auth → `auth.role()='authenticated'` blockt alles. |
| Fehlende Faktoren-Spalten in `daily_pricing` | Für Transparenz/Audit (Saison, DOW, Event, Gap) muss `daily_pricing` erweitert werden. |
| `local_events` / `market_data_cache` | sinnvoll, behalten. |

## Lösung

### 1. Migration: Aufräumen + Anpassen

- **Drop** `nightly_rates`, `properties`, alte Funktion `update_dynamic_price` (property-basiert).
- **Erweitere** `daily_pricing` um:
  - `dynamic_price`, `final_price` numeric
  - `factor_season`, `factor_dow`, `factor_leadtime`, `factor_occupancy`, `factor_event`, `factor_gap` numeric(5,3)
  - `market_occupancy`, `market_avg_price` numeric, `market_source` text
  - `is_blocked` boolean default false, `is_booked` boolean default false, `booked_at` timestamptz
- **Behalte** `local_events` und `market_data_cache` (RLS aus, da Dev-Phase).
- **Behalte/erweitere** `pricing_logs`, aber ersetze `property_id` durch `house_id uuid references houses(id) on delete cascade`.
- **Neue Funktion** `update_dynamic_price(p_house_id, p_date, p_dynamic_price, p_factors jsonb, p_market_occupancy, p_market_avg_price, p_source)` analog zur Vorlage, jedoch gegen `houses` + `daily_pricing` (Upsert auf `house_id,date`, schreibt Log nur bei Preisänderung). Liest `base_price` aus `houses`.
- **RLS deaktivieren** auf `local_events`, `market_data_cache`, `pricing_logs` (Dev-Phase, konsistent zu restl. Tabellen).

### 2. Code-Anpassung

- `src/hooks/useDynamicPricing.ts`: Rückgabewert um `factors` (alle 6) erweitern, sodass sie persistiert werden können (bereits intern berechnet, nur exposen).
- `src/components/Guests/DynamicPricingPanel.tsx`: 
  - `handleAccept` → statt direktem Upsert die RPC `update_dynamic_price` aufrufen (übergibt house_id, date, price, factors, marketOcc, marketAvgPrice=null, source='manual').
  - Lokale Events aus `local_events` für gewähltes Datum laden und Switch automatisch befüllen (Fallback auf manuelle Auswahl).
  - Anzeige eines kleinen "Preishistorie"-Hinweises aus `pricing_logs` für die gewählte (haus, datum)-Kombination.
- `src/components/PricingCard.tsx`: unverändert, nutzt weiterhin Hook-Output.

### 3. Was NICHT gemacht wird

- Kein Auth-Refactor.
- Keine Massendaten-Migration (nightly_rates ist leer / nicht im Code referenziert).
- Keine UI für `local_events`-Pflege in dieser Iteration (nur Lesen). CRUD kann später folgen.

### 4. Dateiänderungen (Zusammenfassung)

```text
SQL Migration (neu)
src/hooks/useDynamicPricing.ts        (Faktoren in Result)
src/components/Guests/DynamicPricingPanel.tsx  (RPC + local_events)
```

Nach Approval führe ich die Migration aus und passe Hook + Panel an.

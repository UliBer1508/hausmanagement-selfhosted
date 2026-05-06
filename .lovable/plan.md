
## Ziel
Die Smart-Update-Engine (`supabase/functions/pricing-engine/index.ts`) realistischer für den Pinzgau-Markt machen. Sechs konkrete Schwachstellen werden behoben. Defaults so wählen, dass bestehende `pricing_config.factors`-Overrides aus der DB unverändert weiterwirken.

## Änderungen im Detail

### 1) Wochenend-Faktoren (DOW) – Samstag als Top-Anreisetag
In `DEFAULT_FACTORS.dow` ersetzen:
```
{ 0: 1.10, 1: 0.85, 2: 0.85, 3: 0.85, 4: 0.95, 5: 1.25, 6: 1.35 }
// So 1.10, Mo–Mi 0.85, Do 0.95, Fr 1.25, Sa 1.35
```
(`isoWeekday` liefert 0=Mo … 6=So – Mapping wird entsprechend angepasst, damit Sa=Index 5, So=Index 6.)

### 2) Saison-Faktoren – Sommer-Peak im Pinzgau
`DEFAULT_FACTORS.season` neu:
```
1: 1.40, 2: 1.50, 3: 0.85, 4: 0.70, 5: 0.85,
6: 1.10, 7: 1.50, 8: 1.55, 9: 0.95, 10: 0.75, 11: 0.65, 12: 1.30
```
Juli/August klar über Winter-Peak; Juni etwas angehoben (Wandersaison-Start).

### 3) Echte Gap-Längen-Erkennung
Aktuelle Heuristik (`prev1/2` + `next1/2`) ersetzen:
- Vom aktuellen Datum rückwärts/vorwärts laufen bis je zur nächsten gebuchten/blockierten Nacht (max. Suchfenster 14 Tage).
- `gapLen` = Länge des zusammenhängenden freien Blocks, in dem `d` liegt.
- Nur wenn beide Seiten innerhalb des Fensters auf Booked treffen, gilt es als echte Lücke.
- Mapping: `gapLen ≤ 2 → gap.short`, `3–4 → gap.long`, `5–7 → 0.92`, `>7 → 1.00` (kein Gap-Discount mehr für lange Lücken).
- Defaults `F.gap` um Felder `medium: 0.92`, `none: 1.00` ergänzen.

### 4) Wetter-Klimatologie als Fallback nach Tag 16
Neue Konstante `CLIMATOLOGY_PINZGAU` mit monatlichen Erwartungswerten (12 Einträge, Faktor 0.95–1.08), gestützt auf typische Schönwetter-/Niederschlagsmuster Hohe Tauern:
```
Jan 1.05, Feb 1.06, Mär 1.02, Apr 0.98, Mai 0.98, Jun 1.00,
Jul 1.02, Aug 1.03, Sep 1.05, Okt 1.00, Nov 0.97, Dez 1.04
```
Logik: Ist `weather.get(dStr)` vorhanden → `weatherFactor(code,…)` wie bisher. Sonst → `CLIMATOLOGY_PINZGAU[month]`. Werte überschreibbar via `pricing_config.factors.weather_climatology`.

### 5) Ferien Multi-Country (NL, CZ, PL, HU) zusätzlich zu AT/DE-BY
- `fetchHolidaysFor(year)` erweitert: zusätzlich `NL`, `CZ`, `PL`, `HU` parallel via OpenHolidays API.
- Cache-Struktur wird `Record<countryCode, Set<string>>`.
- Neuer Faktor-Block `holiday`:
  ```
  at: 1.25, de_by: 1.25, foreign_single: 1.10, foreign_multi: 1.18,
  at_plus_de: 1.35, at_or_de_plus_foreign: 1.40
  ```
- `holidayFactor(date, cache, F.holiday)`:
  - `localCount` = AT-Treffer + DE-BY-Treffer (0–2)
  - `foreignCount` = Treffer in NL/CZ/PL/HU (0–4)
  - Beide 0 → 1.00
  - Nur lokal: 1 → `at`/`de_by`, 2 → `at_plus_de`
  - Nur ausländisch: 1 → `foreign_single`, ≥2 → `foreign_multi`
  - Lokal + ausländisch → `at_or_de_plus_foreign`
- API-Fehler (z.B. einzelnes Land down) werden geschluckt (leeres Set), Engine läuft weiter.

### 6) Length-of-Stay-Rabatt (LOS)
Neuer Faktor pro Datum auf Basis aktueller/zukünftiger Buchungslage:
- Beim Initialladen zusätzlich `start_date, end_date, status` aus `bookings` für `house_id` im Bereich laden, alle aktiven (`confirmed`, `checked_in`, `pending`) Buchungen einsammeln.
- Für ein Datum `d` mit aktiver Buchung: Aufenthaltsdauer = `nights = end - start`. (Buchungsnächte sind in der bestehenden Engine ohnehin übersprungen — daher kein Effekt direkt.)
- Wirklicher Use-Case: LOS als Anreiz für *neue* Buchungen, indem Preise an Tagen, die Teil eines möglichen langen Aufenthalts wären (= zusammenhängender freier Block ≥ 7 Nächte um `d`), reduziert werden.
- `losFactor`:
  - freier Block ≥ 21 → 0.85
  - ≥ 14 → 0.90
  - ≥ 7  → 0.95
  - sonst → 1.00
- Wird mit den anderen Faktoren multipliziert, anschließend `min/max`-Clamp wie gehabt.
- Default-Block `F.los = { d7: 0.95, d14: 0.90, d21: 0.85 }` für DB-Override.

### 7) Faktoren-Objekt im Response & RPC
`factors`-JSON pro Tag erweitern um:
```
{ seasonality, dayOfWeek, leadTime, occupancy, gap, event, weather, holiday, los }
```
`update_dynamic_price` ignoriert unbekannte Felder; das `factors`-JSONB wird vollständig persistiert. Preview-Objekt analog erweitern.

## Betroffene Dateien
- `supabase/functions/pricing-engine/index.ts` (alle Änderungen oben)

Keine DB-Migration nötig (alle Felder existieren in `daily_pricing.factors` JSONB / `pricing_config.factors`). `src/services/pricingService.ts` (Fallback-Engine via `useDynamicPricing`) bleibt unverändert.

## Validierung nach Deploy
1. `pricing-engine` deployen.
2. Testaufruf für ein Haus über 30 Tage → `preview[]` prüfen: Sa-Preise > Fr > So > Mi; Aug-Preise höher als Feb für gleichen Wochentag.
3. Künstliche Buchung mit 5-Tage-Lücke → mittlerer Tag bekommt `gap` ∈ {0.88, 0.92}.
4. Datum > 16 Tage in Zukunft → `weather` ≠ 1.00 (Klimatologie greift).
5. NL-Schulferientag prüfen → `holiday` ≥ 1.10.
6. Tag in 14-Nächte-Lücke → `los` = 0.90.

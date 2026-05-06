## Ziel
Maßnahmen **A** (Schulferien-API) und **C** (Smart-Update einmal anstoßen) umsetzen, damit Pfingstferien Bayern und alle anderen Schulferien (NL/CZ/PL/HU) endlich als Holiday-Faktor erkannt werden und die neuen Pinzgau-Faktoren in der DB landen.

## A) Schulferien zusätzlich abfragen — `supabase/functions/pricing-engine/index.ts`

### Neue Helper-Funktion
Analog zu `fetchOpenHolidays` eine zweite Funktion einführen, die den `/SchoolHolidays`-Endpoint der OpenHolidays-API nutzt:
```
https://openholidaysapi.org/SchoolHolidays?countryIsoCode={CC}&languageIsoCode=DE&validFrom={year}-01-01&validTo={year}-12-31[&subdivisionCode={SUB}]
```
- Iteriert über `startDate`/`endDate` jedes Eintrags und expandiert in Einzeltage (gleiche Logik wie `fetchOpenHolidays`).
- Fehler werden geschluckt → leeres Set.

### `fetchHolidaysFor(year)` erweitern
Pro Land **zwei** parallele Calls (PublicHolidays + SchoolHolidays), Ergebnisse pro Cache-Schlüssel zu **einem** Set vereinigen:
- `AT`           → PublicHolidays(AT) ∪ SchoolHolidays(AT)
- `DE_BY`        → PublicHolidays(DE, DE-BY) ∪ SchoolHolidays(DE, DE-BY)  ← deckt **Pfingstferien Bayern** ab
- `NL`, `CZ`, `PL`, `HU` → jeweils Public + School (national, ohne Subdivision)

`holidayFactor()` bleibt unverändert — die bestehende Lokal/Foreign-Logik wirkt automatisch auch auf Schulferientage.

### Mini-Cache (optional, nice to have)
Damit wiederholte Smart-Update-Aufrufe innerhalb derselben Function-Instanz nicht jedes Mal 12 HTTP-Calls machen: ein Modul-Level `Map<string, Set<string>>` mit Key `${type}:${country}:${sub}:${year}`. Lebt nur so lange wie die Edge-Function-Instanz, daher unkritisch.

## C) Smart-Update einmal automatisch anstoßen

Nach dem Deploy der Engine wird einmalig pro aktivem Tourist-Haus die `pricing-engine` Edge-Function für die nächsten **365 Tage** aufgerufen (`date_from = heute`, `date_to = heute + 365`). Dadurch:
- Fließen die neuen DOW-/Saison-Faktoren in `daily_pricing` ein.
- Werden Pfingsten 2026 (23.–25. Mai) und alle Sommerferien-Zeiträume sofort sichtbar.
- Wird `factors.holiday > 1.0` für alle Schulferien-Tage gesetzt.

Implementierung als Einmal-Skript via `code--exec` (Node + supabase-js, anon key + Edge-Function-Aufruf): nach dem Engine-Deploy sequentiell durch alle aktiven Tourist-Häuser iterieren und `supabase.functions.invoke('pricing-engine', { body: { house_id, date_from, date_to } })`. Sequentiell, nicht parallel, um Rate-Limits der OpenHolidays-API zu schonen.

Ergebnis (updated/errors pro Haus) wird im Chat ausgegeben.

## Nicht im Scope (B)
`min_price`-Anpassung Venedigersiedlung wird **nicht** automatisch geändert — bleibt manuelle Entscheidung. Nach Smart-Update kann der User in der UI sehen, welche Tage trotz Holiday-Faktor noch am Floor klemmen, und gezielt entscheiden.

## Validierung nach Umsetzung
1. SQL-Check: `SELECT date, dynamic_price, factor_season, factors FROM daily_pricing WHERE house_id = '<venedigersiedlung>' AND date BETWEEN '2026-05-22' AND '2026-05-26' ORDER BY date;` — `factors->>'holiday'` muss ≥ 1.25 sein.
2. Preview im UI für Mai 2026 zeigt deutlich höhere Preise an Pfingsten als an „normalen" Mai-Wochenenden.

## Betroffene Dateien
- `supabase/functions/pricing-engine/index.ts` (A)
- Einmaliges Trigger-Skript via Sandbox-Exec (C, kein persistierter Code)

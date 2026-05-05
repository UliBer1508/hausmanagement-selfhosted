## Ziel

Robusteres Ferien-Gewichtungssystem in `src/lib/schoolHolidays.ts`, das mehr Herkunftsländer abdeckt und mit Freitext-Nationalitäten umgehen kann. Anschließend leichte Anpassung von `marketOccupancyService.ts` (Normalisierung greift bereits vor `getHolidayWeight`).

## Änderungen

### 1. `src/lib/schoolHolidays.ts` (neu schreiben/ersetzen)

Drei Exports:

- `getStaticHolidayWeight(date, countryCodes)` – Stufe 1
- `getDynamicHolidayWeight(date, countryCodes)` – Stufe 2
- `getHolidayWeight(date, countryCodes)` – Hauptfunktion, kombiniert via `Math.max`

**Stufe 1 – statische Ferienranges** (MM-DD basierte Ranges, jährlich wiederkehrend):

- `DE-BY` (Bayern), `DE-NW` (NRW), beide unter Code `DE` aktiv (Code `DE` aktiviert beide Sets)
- `AT`, `NL`, `CZ`, `PL`, `HU`, `CH`, `BE`, `FR`, `IT`
- Pro Land: Sommerferien, Weihnachtsferien, Herbst-/Frühjahrsferien (wo relevant), nationale Feiertage
- Ostern (±3 Tage um Ostersonntag, dynamisch via Gauss-Algorithmus) gilt für alle Länder
- Multiplikator-Skala: 0 → 1.0, 1 → 1.10, 2 → 1.20, 3 → 1.30, 4+ → 1.40

**Stufe 2 – dynamische/Mondkalender-Länder**:

- Codes: `IL`, `SA`, `AE`, `KW`, `QA`, `BH`, `JO`, `EG`
- Reisemuster-Approximation (kein exaktes Ferienwissen, klar im Code kommentiert):
  - Juli/August → 1.20 (Sommerflucht aus Hitze, Eid-Reisen)
  - Dezember → 1.10 (Winterreisen)
  - Sonst → 1.0
- Skaliert nicht mit Anzahl Länder, nur ob mind. 1 Land der Gruppe enthalten ist (Effekt ist global ähnlich)

**Hauptfunktion**:

```text
getHolidayWeight(date, codes):
  normalized = codes.map(normalize).filter(known)
  staticCodes = normalized ∩ {DE, AT, NL, CZ, PL, HU, CH, BE, FR, IT}
  dynamicCodes = normalized ∩ {IL, SA, AE, KW, QA, BH, JO, EG}
  return max(getStaticHolidayWeight(date, staticCodes),
             getDynamicHolidayWeight(date, dynamicCodes))
```

**Normalisierung** (`normalizeCountryCode`):

Map mit gängigen Varianten (DE/EN/Native), z.B.
- "Deutschland", "Germany", "DEU", "DE" → `DE`
- "Österreich", "Austria", "AUT" → `AT`
- "Niederlande", "Netherlands", "Holland", "NLD" → `NL`
- "Tschechien", "Czech Republic", "Czechia" → `CZ`
- "Ungarn", "Hungary" → `HU`
- "Polen", "Poland" → `PL`
- "Schweiz", "Switzerland" → `CH`
- "Belgien", "Belgium" → `BE`
- "Frankreich", "France" → `FR`
- "Italien", "Italy" → `IT`
- "Israel" → `IL`
- "Saudi Arabia", "Saudi-Arabien", "KSA" → `SA`
- "UAE", "United Arab Emirates", "VAE", "Vereinigte Arabische Emirate" → `AE`
- "Kuwait" → `KW`, "Qatar"/"Katar" → `QA`, "Bahrain" → `BH`, "Jordan"/"Jordanien" → `JO`, "Egypt"/"Ägypten" → `EG`
- Bereits 2-stellige ISO-Codes werden uppercased durchgereicht
- Unbekannte Werte → `null` (ignoriert, kein Throw)

### 2. `src/services/marketOccupancyService.ts` (kleine Anpassung)

Aktuell wird in `fetchGuestNationalities` nur `toUpperCase()` gemacht. Da `nationality` Freitext sein kann, hier ebenfalls Roh-Strings durchreichen — die Normalisierung passiert dann zentral in `getHolidayWeight`. Konkret:

- Tally-Logik beibehalten, aber kein erzwungenes `toUpperCase` (Strings 1:1 sammeln, getrimmt)
- Top-5 Roh-Strings zurückgeben
- Default-Fallback bleibt `["DE", "AT"]`

Keine weiteren Änderungen — `estimateOccupancyFromSeason` ruft bereits `getHolidayWeight` auf, Interfaces und `useMarketData` bleiben unverändert.

## Hinweise

- Stufe-2-Werte sind explizit als Näherung im Code-Kommentar markiert
- `Math.max` statt Summe verhindert Doppelzählung bei Überlappung (z.B. Sommer überall)
- Ostern wird für alle Stufe-1-Länder einheitlich angewendet
# Konfigurierbare Pricing-Faktoren

## Aktueller Zustand: Wo kommen die Werte her?

Alle Faktoren sind aktuell **im Code** der Edge Function `supabase/functions/pricing-engine/index.ts` hartkodiert. Sie werden **nicht** aus den genannten Resourcen (Wetter, Feiertage, Events) "abgefragt" — diese liefern nur Roh-Daten (z.B. Wettercode, Feiertags-Datum), die anschließend durch hartkodierte Lookup-Tabellen in Multiplikatoren übersetzt werden.

| Faktor | Quelle der Multiplikatoren | Quelle der Roh-Daten |
|---|---|---|
| `season` (Monat) | hartkodiert `PINZGAU_SEASON_FACTORS` (Zeile 12-15) | — |
| `dow` (Wochentag) | hartkodiert `DOW_FACTORS` (Zeile 17-19) | — |
| `leadtime` | hartkodiert `leadtimeFactor()` (Zeile 27-34) | berechnet aus `today` |
| `occupancy` | hartkodierte Schwellen `occupancyFactor()` (36-42) | live aus `daily_pricing` Tabelle |
| `gap` | hartkodiert 0.75 / 0.88 (Zeile 237-238) | aus `daily_pricing` |
| `event` | hartkodiert small=1.05/medium=1.15/large=1.30 | aus `local_events` Tabelle |
| `weather` | hartkodiert `weatherFactor()` (44-51) | Open-Meteo API |
| `holiday` | hartkodiert 1.20/1.25/1.35 (73-79) | OpenHolidays API (AT + DE-BY) |
| `base/min/max` | aus `houses.pricing_config` (DB) | Bereits konfigurierbar in UI |

Eine **teilweise** Override-Logik existiert bereits: `houses.pricing_config.calibration.factor_adjustments.season` kann die Saison-Faktoren überschreiben. Andere Faktoren werden ignoriert.

## Ziel

Alle Multiplikatoren pro Haus über die UI im "Preise"-Tab konfigurierbar machen, gespeichert als JSON in `houses.pricing_config.factors`. Defaults bleiben die jetzigen Pinzgau-Werte als Fallback.

## Umsetzung

### 1. Datenstruktur (kein Migration nötig)
`houses.pricing_config` ist bereits JSONB. Erweiterung um neuen Block `factors`:
```json
{
  "base_price": 180, "min_price": 100, "max_price": 400,
  "factors": {
    "season":   { "1":1.4,"2":1.5,"3":0.8, ... "12":1.3 },
    "dow":      { "0":0.85,"1":0.85, ... "6":0.95 },
    "leadtime": [ {"days":90,"factor":0.90}, {"days":60,"factor":0.95}, ... ],
    "occupancy":[ {"threshold":0.30,"factor":0.85}, ... ],
    "gap":      { "short":0.75, "long":0.88 },
    "event":    { "small":1.05,"medium":1.15,"large":1.30 },
    "weather":  { "clear":1.05,"cloudy":1.00,"rain":0.95,"snow_winter":1.10,"snow_summer":0.90,"storm":0.92 },
    "holiday":  { "at":1.25,"de_by":1.20,"both":1.35 }
  }
}
```

### 2. Edge Function `pricing-engine` anpassen
- Helper `loadFactors(cfg)` baut komplettes Faktor-Set: User-Werte falls vorhanden, sonst Defaults aus den jetzigen Konstanten.
- Alle hartkodierten Funktionen (`leadtimeFactor`, `occupancyFactor`, `weatherFactor`, `eventFactor`, `holidayFactor`) nehmen das Faktor-Set als Parameter.
- Defaults bleiben als Fallback im Code → Bestand bricht nicht.

### 3. Neue UI-Komponente `PricingFactorsConfig`
Neuer Tab/Akkordion innerhalb `PricingDashboard` (im integrierten "Preise"-Tab des Dashboards):

- **Saison-Multiplikatoren**: 12 Slider/Inputs (Jan–Dez), Standardwert sichtbar, Reset-Button.
- **Wochentage**: 7 Inputs (Mo–So).
- **Lead-Time Stufen**: editierbare Tabelle (Tage > X → Faktor).
- **Auslastung**: editierbare Schwellen-Tabelle.
- **Gap-Discount**: 2 Inputs (1-2 Nächte / 3-4 Nächte).
- **Events**: 3 Inputs (small/medium/large).
- **Wetter**: 6 Inputs (Klar, Bewölkt, Regen, Schnee Winter, Schnee Sommer, Sturm).
- **Feiertage**: 3 Inputs (AT, Bayern, beide).
- **"Speichern"** schreibt nach `houses.pricing_config.factors`.
- **"Auf Standardwerte zurücksetzen"** entfernt `factors`.

### 4. Info-Panel "Datenquellen"
Kleiner Info-Block in der UI, der auflistet:
- Wetter: Open-Meteo (16-Tage-Vorhersage, Lat 47.25 / Lon 12.17)
- Feiertage: OpenHolidays (AT + DE-BY)
- Events: Tabelle `local_events`
- Auslastung: Live aus `daily_pricing`

### 5. Dateien
- `supabase/functions/pricing-engine/index.ts` — Defaults extrahieren, `loadFactors()` einführen, Funktionen parametrisieren.
- `src/components/Pricing/PricingFactorsConfig.tsx` — neue Komponente (Form + Save).
- `src/components/Pricing/PricingDashboard.tsx` — neuer Sub-Tab "Faktoren".

### Technische Details
- Speichern erfolgt client-seitig per `supabase.from('houses').update({ pricing_config: {...} })`.
- Validierung: alle Faktoren > 0, sinnvolle Bounds (z.B. 0.1–3.0).
- Bei nächster Smart-Recalculation greifen die neuen Werte automatisch.

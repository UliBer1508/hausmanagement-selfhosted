

# Erweiterung: Wettbewerber-Scraping mit konfigurierbaren Suchparametern

## Uebersicht

Der aktuelle Scraping-Dialog ist ein "One-Click"-Button ohne Einstellungsmoeglichkeiten. Er sucht immer nur den aktuellen Monat, 7 Naechte, mit der Gaestezahl aus `competitor_properties.max_guests`. Es gibt keine Portal-Auswahl und keinen flexiblen Zeitraum.

Die Erweiterung macht den Dialog zu einem vollwertigen Suchformular mit konfigurierbaren Parametern.

## Aenderungen

### 1. ScrapePricesDialog komplett ueberarbeiten

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

Neuer Dialog mit Formularfeldern:

| Feld | Typ | Default |
|------|-----|---------|
| Check-in von | Datepicker | Heute |
| Check-in bis | Datepicker | Ende aktueller Monat |
| Min. Naechte | Number Input | 7 |
| Anzahl Gaeste (Erwachsene) | Number Input | 2 |
| Anzahl Kinder | Number Input | 0 |
| Portale | Multi-Select Checkboxen | Alle ausgewaehlt |

**Portal-Auswahlliste:**
- Booking.com
- Airbnb
- VRBO
- Belvilla
- FeWo-direkt
- Holidu
- Traum-Ferienwohnungen
- Alle Portale (uebergreifende Suche)

Alle Einstellungen werden als Body-Parameter an die Edge Function gesendet.

### 2. Edge Function erweitern

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Neue Body-Parameter akzeptieren:
```text
{
  manual: true,
  check_in_from: "2026-06-01",
  check_in_to: "2026-06-30",
  min_nights: 7,
  guests_adults: 4,
  guests_children: 2,
  platforms: ["booking.com", "airbnb", "vrbo"]
}
```

Den Perplexity-Prompt dynamisch aufbauen:
- Statt hardcoded "7 Naechte" → `min_nights` verwenden
- Statt `property.max_guests` → uebergebene Gaestezahl verwenden
- Statt nur Booking.com → Perplexity anweisen, auf den gewaehlten Portalen zu suchen
- Zeitraum aus `check_in_from`/`check_in_to` statt hardcoded aktueller Monat

Prompt-Anpassung (Beispiel fuer Landing-Page):
```text
AUFGABE: Finde einen Preis fuer diese Ferienunterkunft:
NAME: {property_name}
URL: {property_url}

SUCHPARAMETER:
- Check-in: Beliebiger Tag zwischen {check_in_from} und {check_in_to}
- Aufenthalt: Mindestens {min_nights} Naechte
- Gaeste: {guests_adults} Erwachsene, {guests_children} Kinder
- Portale: Suche auf {platforms.join(', ')}

Falls die URL zu einem bestimmten Portal gehoert, suche dort.
Falls nicht, suche den guenstigsten Preis ueber die angegebenen Portale.
```

Antwort-JSON erweitern um `platform` und `nights`:
```json
{
  "total_price": 1890,
  "check_in": "2026-06-15",
  "check_out": "2026-06-22",
  "nights": 7,
  "platform": "booking.com",
  "available": true,
  "currency": "EUR"
}
```

### 3. monthly_pricing Tabelle erweitern (Migration)

Neue Spalten:
- `nights` (integer, default 7) — Anzahl Naechte
- `guests_adults` (integer, nullable) — Suchparameter Erwachsene
- `guests_children` (integer, nullable) — Suchparameter Kinder
- `platform_source` (text, nullable) — Welches Portal den Preis lieferte

### 4. Ergebnis-Anzeige im Dialog

Nach dem Scraping: Ergebnisliste im Dialog anzeigen (statt nur Toast), mit:
- Property-Name
- Gefundener Preis + Portal
- Check-in/Check-out + Naechte
- Status (Erfolg/Fehler)

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `ScrapePricesDialog.tsx` | Komplett neu: Suchformular mit Parametern |
| `scrape-competitor-prices/index.ts` | Neue Parameter, dynamischer Prompt, Portal-Suche |
| Migration | 4 neue Spalten in `monthly_pricing` |




# Booking.com & Airbnb: Separate Portal-Suchen mit optimierten Prompts

## Konzept

Statt einer einzelnen generischen Suche werden **zwei separate Perplexity-Anfragen** durchgeführt -- eine für Booking.com und eine für Airbnb. Jedes Portal hat spezifische Suchparameter und einen optimierten Prompt. Die Ergebnisse werden **getrennt nach Portal** mit Tab-Ansicht dargestellt.

## Warum separate Suchen?

- Booking.com und Airbnb haben unterschiedliche Preisstrukturen (Booking: Endpreis inkl. Gebühren, Airbnb: Basispreis + Service-Fee + Reinigungsgebühr)
- Separate Prompts können portalspezifische Details extrahieren (Booking: Bewertungspunkte 1-10, Airbnb: Sterne 1-5)
- Zwei `sonar-pro`-Anfragen parallel liefern mehr Citations = mehr echte Links

## Suchparameter pro Portal

### Booking.com
- Ort, Check-in, Check-out, Personen
- Prompt-Fokus: "booking.com Ferienwohnung [Ort] [Datum]"
- Preis: Endpreis inkl. aller Gebühren und Steuern
- Rating: Punkte-System (1-10)
- Domain-Hinweis im Prompt: "Suche auf booking.com nach..."

### Airbnb
- Ort, Check-in, Check-out, Personen
- Prompt-Fokus: "airbnb [Ort] Ferienhaus [Datum]"
- Preis: Gesamtpreis (Basis + Service-Fee + Reinigung)
- Rating: Sterne (1-5) + Superhost-Status
- Domain-Hinweis im Prompt: "Suche auf airbnb.com / airbnb.de nach..."

## Technische Änderungen

### 1. Edge Function (`scrape-competitor-prices/index.ts`)

**Neuer Modus**: Wenn `platforms` nur `booking.com` und/oder `airbnb` enthält, werden separate Anfragen pro Portal gesendet (parallel mit `Promise.all`).

Jeder Portal-Prompt ist optimiert:

**Booking.com-Prompt:**
```
Suche auf booking.com nach Ferienwohnungen und Ferienhaeusern in [Ort].
Zeitraum: [Check-in] bis [Check-out], [X] Personen.
Finde konkrete Inserate mit dem Endpreis (inkl. Steuern und Gebuehren).
Booking.com zeigt Bewertungen als Punktzahl (1-10).
Suche auch auf Aggregatoren die Booking.com-Preise anzeigen (Trivago, Google Hotels, HolidayCheck).
```

**Airbnb-Prompt:**
```
Suche auf airbnb.com oder airbnb.de nach Ferienwohnungen und Ferienhaeusern in [Ort].
Zeitraum: [Check-in] bis [Check-out], [X] Gaeste.
Finde konkrete Inserate mit dem Gesamtpreis (Basis + Service-Gebuehr + Reinigungsgebuehr).
Airbnb zeigt Bewertungen als Sterne (1-5) und Superhost-Status.
Suche auch auf Aggregatoren die Airbnb-Preise anzeigen.
```

Jede Anfrage nutzt `sonar-pro` ohne Domain-Filter (da JS-gerenderte Seiten nicht direkt lesbar sind).

**Response-Struktur** wird erweitert:
```json
{
  "success": true,
  "results_by_platform": {
    "booking.com": { "listings": [...], "citations": [...] },
    "airbnb": { "listings": [...], "citations": [...] }
  },
  "total_listings": 12
}
```

### 2. Frontend (`ScrapePricesDialog.tsx`)

- **Plattform-Auswahl** vereinfachen: Nur noch Booking.com und Airbnb als Checkboxen (+ "Beide")
- **Ergebnis-Anzeige** mit Tabs: `Booking.com (6)` | `Airbnb (4)` | `Alle (10)`
- Pro Tab: Listing-Cards wie bisher, aber mit Portal-spezifischen Details:
  - Booking.com: Bewertungspunkte (z.B. "8.9/10"), blaues Badge
  - Airbnb: Sterne + Superhost-Badge, rotes Badge
- Portal-Logo/Farbe als visueller Unterschied (Booking: blau, Airbnb: rot/pink)

### 3. Portal-spezifische Listing-Felder

Erweiterte `ListingResult` Interface:
```typescript
interface ListingResult {
  // ... bestehende Felder ...
  superhost?: boolean;        // Airbnb-spezifisch
  cleaning_fee?: number;      // Airbnb-spezifisch
  service_fee?: number;       // Airbnb-spezifisch
  booking_rating_score?: number; // Booking.com 1-10
}
```

## Dateien

| Datei | Änderung |
|-------|----------|
| `scrape-competitor-prices/index.ts` | Separate Prompts pro Portal, parallel ausführen, gruppierte Response |
| `ScrapePricesDialog.tsx` | Plattform-Auswahl auf Booking+Airbnb, Tab-Ansicht der Ergebnisse, Portal-spezifische Badges |


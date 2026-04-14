

# Besserer Perplexity-Prompt fuer Tourismus-Preisvergleich

## Problem

Der aktuelle Prompt ist zu komplex und versucht zu viele Preistypen gleichzeitig abzudecken (exact, seasonal, range, per_night, list). Das fuehrt zu unklaren Ergebnissen. Der User braucht nur das, was auf Booking.com steht: **Endpreis pro Nacht oder pro Woche inkl. Steuern/Gebuehren** -- so wie ein Gast es sieht.

## Loesung

### Edge Function (`scrape-competitor-prices/index.ts`)

Den Tourist-Prompt (Zeile 241-310) komplett ersetzen mit einem fokussierteren Ansatz:

**Neuer Prompt-Kern:**
- Frage gezielt nach dem **Endpreis wie auf dem Buchungsportal angezeigt** (inkl. Steuern & Gebuehren)
- Preis entweder als `price_per_night` oder `price_total` mit Angabe der Naechte
- Nebenkosten/Inklusivleistungen als einfaches `includes`-Textfeld (nicht aufgeschluesselt)
- Objektdetails bleiben (sqm, bedrooms, rating etc.)
- Einfachere Preis-Typen: nur `"per_night"` und `"total"` statt 5 verschiedene

**Neues JSON-Format:**
```json
{
  "found": true,
  "property_details": {
    "description": "...",
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "size_sqm": 150,
    "rating": 9.2,
    "review_count": 48,
    "amenities": ["Pool", "Sauna", "WLAN"],
    "address": "Neukirchen am Grossvenediger"
  },
  "prices": [
    {
      "price_per_night": 270,
      "price_total": 1890,
      "nights": 7,
      "guests": 6,
      "check_in": "2026-07-01",
      "platform": "booking.com",
      "includes": "inkl. Steuern, Endreinigung, Bettwaesche"
    }
  ],
  "general_info": "Weitere Preis-Hinweise falls vorhanden"
}
```

**Prompt-Strategie:**
- Klar sagen: "Suche den Preis so wie er auf dem Portal angezeigt wird -- Endpreis fuer den Gast"
- Beide Formate akzeptieren: pro Nacht ODER Gesamtpreis (mit Naechteanzahl)
- Keine kuenstliche Aufschluesselung von Nebenkosten erzwingen
- Wenn nur Nachtpreis bekannt: `price_total` = null, `price_per_night` angeben
- Wenn Gesamtpreis bekannt: beide berechnen (`price_per_night` = `price_total` / `nights`)

### Frontend (`ScrapePricesDialog.tsx`)

- `PriceEntry`-Interface anpassen: `includes` statt `notes`, immer `price_per_night` + optional `price_total`
- Anzeige vereinfachen: Hauptpreis = pro Nacht, daneben Gesamtpreis wenn vorhanden
- `type`-Feld entfaellt (keine Badges mehr fuer "exact"/"range" etc.)

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Tourist-Prompt komplett neu: fokussiert auf Portal-Endpreise, vereinfachtes JSON |
| `ScrapePricesDialog.tsx` | PriceEntry anpassen, Anzeige vereinfachen (Nachtpreis + Gesamtpreis + includes) |


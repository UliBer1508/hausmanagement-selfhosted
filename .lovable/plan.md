

# Fix: Einfach den Inseratspreis auslesen + Link zum Angebot

## Problem

Perplexity findet bei 4 von 5 Objekten keine Preise, weil der Prompt zu spezifische Suchkriterien verlangt (exakter Zeitraum, exakte Gästeanzahl, exakte Nächte). Booking.com zeigt Preise dynamisch -- Perplexity findet diese selten für den exakten Zeitraum. Zusätzlich werden die Perplexity-Citations (= direkte Links zum Inserat) komplett ignoriert.

## Lösung

Den Prompt radikal vereinfachen: Nur den aktuell im Inserat sichtbaren Preis auslesen, egal für welchen Zeitraum. Und den Inseratslink aus den Perplexity-Citations zurückgeben.

## Änderungen

### 1. Edge Function (`supabase/functions/scrape-competitor-prices/index.ts`)

**A) Prompt vereinfachen (Zeile 331-377)**

Statt komplexer Datums-/Personen-Anforderungen nur fragen:
- "Finde das Inserat von [Name] auf [Portalen]"
- "Lies den dort angezeigten Preis ab"
- "Gib an, für welchen Zeitraum/Personen dieser Preis gilt (wenn sichtbar)"

Neues JSON-Schema (vereinfacht):
```json
{
  "found": true,
  "prices": [{
    "price": 1338,
    "price_info": "1 Woche, 6 Erwachsene, inkl. Steuern",
    "platform": "Booking.com"
  }],
  "property_details": { ... },
  "general_info": "..."
}
```

Keine harte Anforderung mehr an `check_in`, `nights`, `guests` etc. -- nur was im Inserat steht.

**B) Citations auslesen und als `listing_url` zurückgeben (nach Zeile 408)**

Perplexity liefert `data.citations` als Array von URLs. Diese werden:
- Geloggt
- Nach Portal gefiltert (booking.com, airbnb.com etc.)
- Pro Preis-Eintrag als `listing_url` zugeordnet
- Im Result-Objekt mitgegeben

**C) Synthetische Preis-Heuristiken entfernen (Zeile 436-456)**

Die Logik die aus `general_info` Preise schätzt (Regex für "236-456€") wird entfernt. Wenn kein Preis im Inserat steht, dann `found: false`.

**D) Result-Objekt um `listing_url` und `property_url` erweitern (Zeile 531-540)**

```typescript
results.push({
  ...bisherige Felder,
  listing_url: bestCitationUrl || property.property_url || null,
  citations: relevantCitations,
});
```

**E) `competitor_properties.property_url` aktualisieren**

Wenn eine brauchbare Citation-URL gefunden wird und `property.property_url` fehlt, wird sie automatisch gespeichert.

### 2. Dialog (`src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`)

**A) Preis-Anzeige um "Angebot öffnen"-Button erweitern (Zeile 600-630)**

Pro Preis-Eintrag: Wenn `listing_url` oder `evidence_url` vorhanden, einen klickbaren Link-Button anzeigen ("Angebot ansehen" mit ExternalLink-Icon), der das Inserat in neuem Tab öffnet.

**B) Fallback-Bereich erweitern (Zeile 634-638)**

Auch wenn keine Preise gefunden wurden, aber ein `listing_url` existiert, einen Button "Inserat öffnen" anzeigen.

### Zusammenfassung

| Datei | Änderung |
|---|---|
| `scrape-competitor-prices/index.ts` | Prompt vereinfachen (nur sichtbaren Preis lesen), Citations als Links nutzen, Heuristiken entfernen, property_url updaten |
| `ScrapePricesDialog.tsx` | "Angebot ansehen"-Button pro Preis-Eintrag mit Link zum Inserat |

### Technischer Ablauf (neu)

```text
Perplexity sucht Inserat auf booking.com
  → liest sichtbaren Preis ab (z.B. "€1.338")
  → liest Preis-Info ab (z.B. "1 Woche, 6 Erwachsene")
  → liefert Citations (URLs zum Inserat)
Edge Function:
  → nimmt Preis + Citation-URL
  → speichert in monthly_pricing
  → gibt listing_url zurück
UI:
  → zeigt Preis + "Angebot ansehen" Button
  → Klick öffnet Booking.com-Inserat direkt
```


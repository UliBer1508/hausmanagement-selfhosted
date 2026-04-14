

# Prompt-Optimierung: Portal-Endpreise gezielter finden

## Problem

Der aktuelle Prompt ist inhaltlich korrekt, aber Perplexity findet trotzdem oft keine Preise. Das liegt daran, dass:
1. Perplexity ohne `search_domain_filter` zu breit sucht
2. Der Prompt zu viele Optionen anbietet ("Preislisten, Saisontabellen sind willkommen") -- das lenkt ab
3. Kein gezielter Suchfokus auf die konkreten Buchungsportale gesetzt wird

## Loesung

### Edge Function (`scrape-competitor-prices/index.ts`)

**A) Perplexity `search_domain_filter` nutzen**

Wenn der User bestimmte Plattformen auswaehlt, diese als Domain-Filter an die API uebergeben. Das zwingt Perplexity, NUR auf diesen Portalen zu suchen:

```text
search_domain_filter: ["booking.com", "airbnb.com", "fewo-direkt.de", ...]
```

**B) Prompt schaerfen**

- Zeile "Auch Preise aus Preislisten oder Saisontabellen sind willkommen" entfernen
- Stattdessen klar machen: "Suche auf Booking.com / Airbnb nach dem Inserat und gib den angezeigten Gesamtpreis an"
- Den Unterkunftsnamen + Ort explizit als Suchbegriff formulieren
- Beispiel aus dem Screenshot als Orientierung geben: "z.B. 1.338 EUR fuer 1 Woche, 6 Erwachsene"

**C) System-Prompt anpassen**

Klarer formulieren: "Du durchsuchst Buchungsportale nach aktuellen Mietpreisen fuer Ferienunterkuenfte. Gib NUR Preise zurueck die du tatsaechlich auf den Portalen findest."

### Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Domain-Filter hinzufuegen, Prompt schaerfen (Portal-Fokus statt Saisontabellen), System-Prompt praezisieren |


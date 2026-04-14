

# Domain-Filter entfernen, Prompt-Fokussierung beibehalten

## Problem
Der `search_domain_filter` Parameter verhindert, dass Perplexity verifizierte Citations (Quellennachweise) zurückgibt, da Booking.com und Airbnb JS-gerenderte Seiten haben, die schwer direkt zu crawlen sind. Ergebnis: leere Citations-Arrays und potenziell halluzinierte URLs.

## Lösung
Den `search_domain_filter` aus beiden API-Aufrufen (Booking.com und Airbnb) entfernen. Die Prompts behalten weiterhin den klaren Fokus auf die jeweiligen Portale bei — Perplexity sucht dann breiter, liefert aber echte Citations zurück.

## Änderungen

**Datei: `supabase/functions/scrape-competitor-prices/index.ts`**

1. **`searchBookingCom`** — `search_domain_filter: ['booking.com']` aus dem Request-Body entfernen
2. **`searchAirbnb`** — `search_domain_filter: ['airbnb.com', 'airbnb.de']` aus dem Request-Body entfernen
3. **`enrichListingsWithCitations`** — Bleibt bestehen, filtert weiterhin Citations nach Portal-Domain (nur booking.com bzw. airbnb.com/de URLs werden Listings zugeordnet)

Die Prompts bleiben unverändert mit klarem Portal-Fokus ("Suche NUR auf booking.com" / "Suche NUR auf airbnb.com").

## Erwartetes Ergebnis
- Perplexity findet Listings über Aggregatoren, aber die Prompts stellen sicher, dass nur Booking/Airbnb-Daten extrahiert werden
- Citations-Array enthält echte, verifizierte URLs
- `enrichListingsWithCitations` ordnet nur passende Portal-URLs den Listings zu


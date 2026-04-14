

# Fix: Plattform-ID-Mapping reparieren + Prompt fokussieren

## Problem

Der Hauptgrund warum Perplexity keine brauchbaren Portalpreise findet:

**Die UI sendet Plattform-IDs** (z.B. `booking.com`, `airbnb`, `fewo-direkt`), aber die Edge Function erwartet **Labels** (z.B. `Booking.com`, `Airbnb`, `FeWo-direkt`) im `domainMap`. Dadurch greift der `search_domain_filter` nie -- Perplexity sucht ueberall statt nur auf den gewaehlten Portalen.

Zusaetzlich: Der Prompt koennte staerker auf den konkreten Portal-Endpreis (Gesamtpreis fuer X Naechte, Y Personen) fokussiert werden.

## Aenderungen

### Edge Function (`supabase/functions/scrape-competitor-prices/index.ts`)

**1) Plattform-Mapping fixen (Tourist-Modus, Zeile 285-296)**

Das `domainMap` muss die IDs akzeptieren die die UI tatsaechlich sendet:

```text
Aktuell (falsch):           Neu (korrekt):
'Booking.com' -> booking    'booking.com' -> booking.com
'Airbnb' -> airbnb.com      'airbnb' -> airbnb.com
'FeWo-direkt' -> fewo...    'fewo-direkt' -> fewo-direkt.de
...                          + Label-Varianten als Fallback
```

**2) Plattform-Mapping fixen (Rental-Modus, Zeile 46-55)**

Gleicher Bug: UI sendet `immoscout24`, `immowelt`, `ebay-kleinanzeigen` -- Map erwartet `ImmoScout24`, `Immowelt`, `eBay Kleinanzeigen`.

**3) platformText ebenfalls normalisieren**

Der `platformText` im Prompt nutzt aktuell die rohen IDs. Er sollte die lesbaren Portal-Namen verwenden (z.B. "Booking.com" statt "booking.com"), damit Perplexity die Portale besser erkennt.

### Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | domainMap-Keys auf UI-IDs umstellen (Tourist + Rental), platformText aus Labels generieren |

Dies ist ein reiner Bug-Fix -- der Domain-Filter existiert bereits, wird aber wegen falscher Keys nie angewendet. Nach dem Fix sucht Perplexity gezielt nur auf z.B. booking.com und findet den konkreten Endpreis wie im Screenshot.


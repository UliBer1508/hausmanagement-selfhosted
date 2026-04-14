

# Fix: Echte Inserat-URLs statt Platzhalter

## Problem

Perplexity liefert in seinem API-Response ein `citations`-Array mit den echten Quell-URLs. Der aktuelle Code ignoriert dieses Array. Stattdessen wird im Prompt nach `listing_url` gefragt, aber Perplexity generiert dort nur Platzhalter-URLs (z.B. "https://www.immobilienscout24.de/expose/...") statt der echten Links.

## Loesung

### 1. Edge Function (`scrape-competitor-prices/index.ts`)

- **Prompt anpassen**: Instruktion ergaenzen, dass Perplexity fuer `listing_url` die exakte Quell-URL aus den eigenen Suchergebnissen verwenden soll, NICHT eine Beispiel-URL. Zusaetzlich: "Wenn du keine exakte URL hast, setze listing_url auf null."
- **Citations extrahieren**: Nach dem API-Call `data.citations` auslesen und als Fallback verwenden. Wenn ein `comparable` keine gueltige `listing_url` hat (oder eine Platzhalter-URL wie "..."), versuche die passende Citation zuzuordnen.
- **Citations im Response mitsenden**: Das `citations`-Array an das Frontend zurueckgeben, damit es als Fallback-Quelle dient.

### 2. Frontend (`ScrapePricesDialog.tsx`)

- **Citations empfangen**: Das `citations`-Array aus der Response speichern.
- **URL-Fallback-Logik**: Beim "Inserat ansehen"-Link pruefen: Wenn `listing_url` fehlt oder ein Platzhalter ist, die passende Citation-URL verwenden (basierend auf Plattform-Name im Source-Feld).

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Prompt: echte URLs fordern; `data.citations` extrahieren und mitsenden |
| `ScrapePricesDialog.tsx` | Citations als Fallback fuer Inserat-Links verwenden |


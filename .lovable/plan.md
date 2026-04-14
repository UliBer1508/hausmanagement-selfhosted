

# Wettbewerbssuche auf Haeuser-Screen verlagern

## Uebersicht

Die Wettbewerber-Preissuche (Scraping) wird aus den einzelnen HouseCards herausgeloest und als zentraler Dialog auf den Haeuser-Screen verlegt. Der User waehlt im Dialog das Haus, fuer das er die Analyse durchfuehren will. Miethaeuser bekommen eine angepasste Mietpreisanalyse.

## Aenderungen

### 1. Neuer Button im Haeuser-Header

**Datei:** `src/components/Houses/HouseManagement.tsx`

Neben dem "Haus hinzufuegen"-Button kommt ein neuer Button "Preisanalyse". Beim Klick oeffnet sich ein erweiterter ScrapePricesDialog.

```text
[ Preisanalyse ]  [ + Haus hinzufuegen ]
```

### 2. ScrapePricesDialog erweitern

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

Neue Funktionen:
- **Haus-Auswahl**: Dropdown mit allen Haeusern (touristisch + Festvermietung)
- **Modus-Erkennung**: Basierend auf `rental_type` des gewaehlten Hauses:
  - `tourist` → Bestehende Logik (Ferienwohnungs-Preise auf Portalen)
  - `long_term` → Mietpreis-Analyse (Prompt wird angepasst: Kaltmiete/Warmmiete, qm-Preis, Vergleichsmieten in der Region)
- **Props-Aenderung**: `house_id` wird optional; die Haeuser-Liste wird per Query geladen

**Mietpreis-Modus (long_term):**
- Statt Portal-Checkboxen: Immobilien-Portale (ImmoScout24, Immowelt, eBay Kleinanzeigen, wg-gesucht)
- Statt Check-in/Naechte: Wohnungsgroesse (qm), Zimmeranzahl, Lage/Adresse
- Perplexity-Prompt sucht Vergleichsmieten in der Region
- Ergebnis: Durchschnittliche Kaltmiete/qm, Preisspanne, Vergleichsobjekte

### 3. Edge Function erweitern

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Neuer Parameter `analysis_type`:
- `tourist` (default): Bestehende Logik
- `rental`: Neuer Prompt fuer Mietpreisanalyse

Fuer Mietpreis-Analyse:
- Input: Adresse, qm, Zimmer, aktuelle Miete
- Perplexity-Prompt: "Finde aktuelle Mietpreise fuer Wohnungen mit X qm, Y Zimmern in [Adresse/Region]"
- Output: Durchschnittsmiete, Preisspanne, qm-Preis, Quellen

### 4. Ergebnis-Speicherung fuer Mietanalyse

Neue Migration: Tabelle `rental_price_analysis` mit:
- `house_id`, `analysis_date`, `avg_rent`, `min_rent`, `max_rent`, `price_per_sqm`, `comparable_count`, `sources` (jsonb), `search_params` (jsonb)

### 5. HouseCard anpassen

**Datei:** `src/components/Houses/HouseCard.tsx`

Der "Preisanalyse"-Button auf den einzelnen Cards bleibt bestehen und oeffnet weiterhin den CompetitorAnalysisDashboard-Dialog (fuer touristische Haeuser). Fuer Miethaeuser zeigt er die letzte Mietpreisanalyse an.

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `HouseManagement.tsx` | Neuer "Preisanalyse"-Button im Header |
| `ScrapePricesDialog.tsx` | Haus-Auswahl, Modus tourist/rental, Mietpreis-UI |
| `scrape-competitor-prices/index.ts` | Neuer `rental`-Modus mit Mietpreis-Prompt |
| Migration | Neue Tabelle `rental_price_analysis` |
| `HouseCard.tsx` | Mietpreis-Ergebnis-Anzeige fuer long_term Haeuser |


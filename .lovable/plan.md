

# Mietpreisanalyse: Umkreis-Parameter + Zimmeranzahl speichern

## Aenderungen

### 1. Frontend (`ScrapePricesDialog.tsx`)

- **Neues Feld "Umkreis (km)"**: Input-Feld (Typ number, default 10, min 1, max 50) neben den bestehenden Feldern Wohnflaeche und Zimmeranzahl im Rental-Modus. Dreispaltiges Grid statt zweispaltiges.
- **Zimmeranzahl speichern**: Button neben dem Zimmeranzahl-Feld oder automatisches Speichern bei Aenderung. Beim Aendern der Zimmeranzahl wird `houses.bedrooms` via Supabase-Update aktualisiert und der Query-Cache invalidiert.
- **Umkreis an Edge Function senden**: `body.radius_km` wird im Request mitgeschickt.

### 2. Edge Function (`scrape-competitor-prices/index.ts`)

- **`radius_km` Parameter**: Aus `body.radius_km` lesen (default 10).
- **Prompt anpassen**: Zeile 58 aendern von hardcoded "10 km" zu dynamischem Wert: `Berücksichtige Wohnungen im Umkreis von ${radiusKm} km`.

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `ScrapePricesDialog.tsx` | Umkreis-Input hinzufuegen, Zimmeranzahl in DB speichern, radius_km mitsenden |
| `scrape-competitor-prices/index.ts` | radius_km Parameter lesen, im Prompt verwenden |


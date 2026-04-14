

# Neuer Ansatz: Standortbasierte Suche statt Namenssuche

## Problem

Der aktuelle Ansatz sucht jede Konkurrenz-Unterkunft einzeln nach Name. Perplexity kann aber dynamische Portal-Preise fuer spezifische Daten/Gaeste nicht zuverlaessig aus einzelnen Inseraten auslesen. 

Der Benutzer will es wie auf Booking.com: **"Neukirchen am Grossvenediger, 6 Personen, naechster Samstag bis uebernaechster Samstag"** eingeben und eine **Liste von Angeboten mit Preisen** zurueckbekommen.

## Loesung

Den Tourist-Modus umbauen: Statt pro Konkurrent einzeln zu suchen, **eine einzige Standort-Suche** durchfuehren. Perplexity sucht dann z.B. "Ferienwohnungen in Neukirchen am Grossvenediger, 18.04.-25.04., 6 Personen auf Booking.com" und liefert eine Liste verfuegbarer Unterkuenfte mit Preisen.

## Aenderungen

### 1. Edge Function (`scrape-competitor-prices/index.ts`)

**Tourist-Modus komplett umbauen (Zeilen 250-578):**

- Neue Parameter akzeptieren: `location` (Ort), `check_in` (Datum), `check_out` (Datum), `guests` (Anzahl)
- **Check-in/Check-out automatisch berechnen**: Naechster Samstag bis uebernaechster Samstag als Default
- **Ein einziger Perplexity-Call** statt Loop ueber Konkurrenten
- Neuer Prompt:

```text
Suche verfuegbare Ferienwohnungen/Chalets in [Ort] 
auf [Portalen] fuer den Zeitraum [Check-in] bis [Check-out] 
fuer [X] Personen.

Liste alle gefundenen Angebote mit:
- Name der Unterkunft
- Gesamtpreis fuer den Zeitraum
- Preis pro Nacht (wenn angegeben)
- Plattform (Booking.com, Airbnb etc.)
- Kurzbeschreibung
- Max. Gaeste, Schlafzimmer
- Bewertung

Antwort als JSON-Array.
```

- Citations als Links zu den Inseraten zuordnen
- Ergebnisse optional mit bestehenden `competitor_properties` matchen und neue automatisch anlegen

### 2. UI (`ScrapePricesDialog.tsx`)

**Suchformular vereinfachen:**

- **Ort**: Vorausgefuellt aus `house.address` (z.B. "Neukirchen am Grossvenediger"), editierbar
- **Check-in / Check-out**: Zwei Datumspicker (Default: naechster/uebernaechster Samstag)
- **Personen**: Anzahl (Default aus `house.max_guests`)
- **Portale**: Wie bisher (Booking.com, Airbnb etc.)
- Felder "Min. Naechte" und "Check-in von/bis" Spanne entfernen (werden durch konkretes Datum ersetzt)

**Ergebnis-Anzeige anpassen:**

- Liste von gefundenen Unterkuenften mit Preis, Plattform, Bewertung
- "Angebot oeffnen" Button pro Eintrag (Link aus Citations)
- Optional: "Als Wettbewerber speichern" Button pro Eintrag

### Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Tourist-Modus: Standortsuche statt Namenssuche, ein API-Call, neuer Prompt |
| `ScrapePricesDialog.tsx` | Suchformular: Ort + Check-in/out + Personen, Ergebnisliste mit Links |

### Ablauf (neu)

```text
User waehlt Haus -> Ort wird vorausgefuellt
User setzt Datum (Sa-Sa) und Personen (6)
-> Ein Perplexity-Call: "Ferienwohnungen Neukirchen, 18.04-25.04, 6 Pers., Booking.com"
-> Perplexity liefert Liste: [{name, preis, plattform, ...}]
-> Citations = Links zu den Inseraten
-> UI zeigt Liste mit "Angebot oeffnen" Buttons
```


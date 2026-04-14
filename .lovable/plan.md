

# Wettbewerber-Detailansicht: Klickbare CompetitorCard mit Detail-Dialog

## Uebersicht

Aktuell zeigt die CompetitorCard nur eine Zusammenfassung (Name, Platform, Gaeste, ein paar Amenities). Der User moechte durch Klick auf eine Card alle Details sehen: Immobilien-Infos, Lage, Ausstattung, Bewertungen, Preishistorie, Notizen.

## Aenderungen

### 1. Neuer Detail-Dialog: `CompetitorDetailsDialog.tsx`

**Datei:** `src/components/Houses/CompetitorAnalysis/CompetitorDetailsDialog.tsx` (NEU)

Ein Dialog der alle Informationen eines Wettbewerbers uebersichtlich anzeigt:

- **Header**: Property-Name, Betreiber, Platform-Badge, Link zur Originalseite
- **Lage-Sektion**: Adresse, Entfernung, ggf. Google Maps Link (basierend auf Adresse)
- **Immobilien-Details**: Max. Gaeste, Schlafzimmer, Badezimmer
- **Bewertungen**: Rating mit Sterndarstellung, Anzahl Bewertungen
- **Ausstattung**: Alle Amenities als Badge-Liste (nicht nur 6 wie auf der Card)
- **Preishistorie**: Letzte bekannte Preise aus `monthly_pricing` (Query nach `competitor_property_id`)
- **Notizen**: Vollstaendige Notizen

Layout: ScrollArea im Dialog fuer lange Inhalte.

### 2. CompetitorCard anpassen

**Datei:** `src/components/Houses/CompetitorAnalysis/CompetitorCard.tsx`

- Card bekommt `cursor-pointer` und `onClick` Handler
- Klick oeffnet den neuen `CompetitorDetailsDialog`
- Die Action-Buttons (Edit, Delete, ExternalLink) bleiben oben rechts und stoppen Event-Propagation

### 3. Preishistorie laden

Im Detail-Dialog: Query auf `monthly_pricing` mit `competitor_property_id = competitor.id`, sortiert nach Datum absteigend. Zeigt die letzten Scraping-Ergebnisse als kompakte Liste.

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `CompetitorDetailsDialog.tsx` | NEU: Vollstaendiger Detail-Dialog |
| `CompetitorCard.tsx` | Klickbar machen, Dialog oeffnen |


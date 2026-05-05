## Beschreibungen zu allen Preis-Faktoren ergänzen

Ziel: In `PricingFactorsConfig.tsx` zu jeder Faktor-Kategorie und (wo sinnvoll) zu einzelnen Werten eine kurze, verständliche Erklärung anzeigen — was der Faktor bewirkt, wann er greift, und wie ein Wert > 1 / < 1 den Preis verändert.

### Allgemeine Lese-Regel (oben als Info-Box ergänzen)
- **1.00** = neutral (Basispreis bleibt unverändert)
- **> 1.00** = Aufschlag (z. B. 1.20 = +20 %)
- **< 1.00** = Rabatt (z. B. 0.85 = −15 %)
- Alle Faktoren werden multiplikativ kombiniert: `Endpreis = Basispreis × Saison × Wochentag × Leadtime × Auslastung × Wetter × Feiertag × Event × Lücke`

### Beschreibungen pro Sektion

**Saison (Monat)**
> Berücksichtigt typische Nachfrage im Jahresverlauf. Hochsaison (Winterferien Feb, Sommer Jul/Aug, Weihnachten Dez) bekommt einen Aufschlag; Nebensaison (Nov, Apr) einen Rabatt. Greift für jedes Datum nach Monat des Check-ins.

**Wochentage**
> Wochenenden (Fr/Sa) sind in Ferienregionen stärker nachgefragt → Aufschlag. Wochentage (So-Do) erhalten meist einen Rabatt, um Auslastung zu glätten. Greift pro Übernachtung.

**Vorlaufzeit (Lead-Time)**
> Steuert Frühbucher- und Last-Minute-Logik. Lange Vorlaufzeit = leichter Frühbucher-Rabatt zur frühen Buchungssicherung. Mittlere Vorlaufzeit (14–30 Tage) = Standardpreis bzw. leichter Aufschlag (höchste Zahlungsbereitschaft). Sehr kurzfristig (< 7 Tage) = Last-Minute-Rabatt, um Leerstand zu vermeiden.

**Auslastung**
> Reagiert auf die Buchungsdichte des Monats. Niedrige Auslastung → Rabatt, um Buchungen anzuziehen. Hohe Auslastung → Aufschlag, weil Knappheit Preise rechtfertigt (Yield Management).

**Lücken-Rabatt**
> Wird auf einzelne Tage angewendet, die zwischen zwei Buchungen liegen. Kurze Lücken (1–2 Nächte) sind schwer verkäuflich → stärkerer Rabatt. Längere Lücken (3–4 Nächte) → moderater Rabatt. Verhindert Leerstand zwischen Gäste-Wechseln.

**Lokale Events**
> Greift, wenn in `local_events` ein Event im Zeitraum hinterlegt ist. Klein = lokales Event mit moderater Zugkraft. Medium = überregional. Large = großes Event mit hoher Übernachtungs-Nachfrage (z. B. Festival, Großveranstaltung).

**Wetter**
> Roh-Daten aus Open-Meteo (16-Tage-Vorhersage). Schönes Wetter steigert Buchungslust, Schlechtwetter dämpft sie. Saison-abhängig: Schnee im Winter ist positiv (Skifahren), Schnee im Sommer negativ. Greift nur in der Vorhersage-Reichweite.

**Feiertage**
> Roh-Daten aus OpenHolidays (AT + Bayern). Aufschlag für Brücken-/Feiertage. „Beide" = Feiertag in AT *und* Bayern → stärkster Aufschlag (höchste Reisetätigkeit aus beiden Märkten).

### Zusätzlich pro Eingabefeld
- **Saison**: Tooltip-Hinweis bei Monaten mit typischer Empfehlung (z. B. Februar = Skihochsaison).
- **Wochentage**: Hinweis "Fr/Sa = Wochenend-Aufschlag, Mo-Do = Glättung".
- **Lead-Time**: Erklärung der Reihen-Reihenfolge (höchste Tage-Schwelle zuerst, erste passende Regel greift).
- **Auslastung**: Hinweis "Wert = Anteil belegter Tage im Monat (0 = leer, 1 = voll)".

### Umsetzung (technisch)
- In `src/components/Pricing/PricingFactorsConfig.tsx`:
  - Neue Info-Box „So liest du die Werte" oberhalb des Accordions.
  - Pro `AccordionItem` einen erklärenden `<p>`-Block direkt unterhalb des Triggers (vor den Inputs), konsistent gestylt (`text-xs text-muted-foreground bg-muted/20 rounded p-2`).
  - Optional kleine `Tooltip`-Icons (`Info`) an Spezialfeldern, falls ohne UI-Überladung machbar.
- Keine Änderungen an Datenmodell oder Edge Function.

### Out of Scope
- Keine neuen Faktoren, keine neuen Eingabefelder, keine Logik-Änderung.

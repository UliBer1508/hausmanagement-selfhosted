## 10. Lessons aus der Sitzung 03.08.2026 (Smoobu-Vergleich, Preis-Faktoren, Marktdaten)

> **Diese Sitzung lief schlecht.** Fünfmal wurde aus einem Teilbefund eine
> Diagnose gestellt, ohne die steuernde Stelle gelesen zu haben. Jedes Mal
> musste Uli korrigieren. Die Fehler sind alle vom selben Typ und alle durch
> Abschnitt 2 dieser Datei bereits abgedeckt gewesen — es fehlte nicht die
> Regel, sondern ihre Anwendung vor dem Antworten.

### 10.1 Abwesenheit ist niemals ein Beleg

**Symptom:** `select * from cron.job` enthielt weder `morning-summary-daily`
noch `max-cleaning-reminders-daily`. Die Doku (MASTER, Stand 12.07.2026) sagte
dazu „LIVE, enabled = TRUE". Daraus wurde geschlossen: eine Automatik sei still
ausgefallen.

**Tatsächlich:** Die Karte „Max: Zeiten der Automatik" im Einstellungen-Tab legt
Cron-Jobs beim Einschalten **an** und **löscht** sie beim Ausschalten. Ein
fehlender Job bedeutet „ausgeschaltet", nicht „defekt". Alle fünf Schalter
deckten sich exakt mit dem Ist-Zustand in `cron.job`.

**Regel:** Eine Abwesenheit (fehlender Job, fehlende Datei, leeres Ergebnis) ist
ein **Befund, der eine Erklärung braucht** — nie selbst die Erklärung. Vor jeder
Aussage der Form „X fehlt / ist ausgefallen / wurde nie angelegt" muss die
Stelle gelesen sein, die X **erzeugt oder steuert**. Wird sie nicht gefunden:
fragen statt schließen.

Verwandt mit 6.1 („leeres Ergebnis = zuerst Policy-Verdacht") — dort für Daten,
hier für Infrastruktur.

### 10.2 Dokumentation beschreibt Mechanismen, nicht Schalterstellungen

Der MASTER hielt fest: `enabled = TRUE`, „Cron 06:30", „VOLLSTÄNDIG UMGESETZT
UND LIVE". Das war am 12.07.2026 korrekt und ab dem nächsten Klick auf einen
Schalter falsch. **Ein Laufzeitzustand kann in einer Markdown-Datei nicht aktuell
bleiben.**

**Regel:** Was der Nutzer über die Oberfläche ändern kann, gehört nicht als Wert
in die Doku, sondern als Mechanismus:

> Die fünf Automatik-Jobs werden über die Karte „Max: Zeiten der Automatik"
> (Einstellungen-Tab) an- und ausgeschaltet. Einschalten legt den Cron-Job an,
> Ausschalten löscht ihn. Der aktuelle Stand ist **ausschließlich** über
> `select jobname, schedule, active from cron.job` ablesbar — nicht aus dieser
> Doku.

Betrifft neben den Automatik-Zeiten auch alle „Schalter aus"-Notizen und
Cron-Tabellen mit festen Uhrzeiten.

### 10.3 Gescheiterte Versuche gehören in die Doku — sonst gelten sie als Funktion

`scrape-competitor-prices` und `search-competitors` stehen in `CODE-INDEX.md`
kommentarlos als Edge Functions. Der Cron `monthly-competitor-price-scraping`
läuft weiterhin monatlich am 15. **Beides liefert nichts** — die Buchungsportale
sperren Scraper aus. Das war ein Versuch, der nicht funktioniert hat.

Wer die Doku liest, hält die Funktionen für nutzbar und plant damit. In dieser
Sitzung wurde genau das getan („die Bausteine für eine Marktprüfung habt ihr
bereits") — obwohl seit Monaten keine Daten ankommen.

**Regel:** Bei jeder Funktion muss die Doku vermerken, **ob sie tatsächlich
Ergebnisse liefert**, nicht nur, dass sie existiert. Gescheiterte Versuche
werden als solche gekennzeichnet, nicht stillschweigend liegengelassen.
Verschärfung der bestehenden Regel „Code-Existenz ≠ aktive Nutzung".

### 10.4 Eine Teilkomponente ohne die Ergebniskette zu bewerten führt zu Fehlalarm

**Symptom:** Die Faktorwerte in `PricingFactorsConfig.tsx` weichen von denen in
`pricing-engine/index.ts` ab (August 1.40 statt 1.55, Samstag 1.20 statt 1.35).
Daraus wurde „rund 20 % niedrigere Preise in der Hochsaison" gefolgert.

**Tatsächlich:** Sechs Zeilen unter der Faktormultiplikation steht

```javascript
dyn = Math.max(min, Math.min(max, Math.round(dyn)));
```

Bei Venediger Chalet (Basis 545, Min 445, Max 650) liegt der Korridor bei
0.82–1.19. Ein Augustsamstag ergibt mit beiden Faktorsätzen denselben Preis:
916 € bzw. 1.139 € roh, **beide gedeckelt auf 650 €**. Der Drift hat in der
Hochsaison null Wirkung.

**Regel:** Eine Abweichung in einem Zwischenschritt ist erst dann ein Befund,
wenn sie **bis zum Endergebnis** durchgerechnet wurde. Bei Preis- und
Berechnungsketten heißt das: Deckelungen, Rundungen und Grenzwerte gehören zur
Prüfung, nicht erst zur Nachbetrachtung.

**Der Drift bleibt trotzdem real** und gehört korrigiert — er wirkt in der
Übergangszeit, wo das Faktorprodukt innerhalb des Korridors liegt. Nur die
behauptete Größenordnung war falsch.

### 10.5 Berechnungen mit begrenztem Horizont hinterlassen stillen Altbestand

`PricingDashboard.tsx` ruft `bulkUpdatePricesV2({ houseId, daysAhead: 180 })`.
In `daily_pricing` standen deshalb zwei Generationen nebeneinander:

| Lauf | Tage | Zeitraum | Preisspanne |
|---|---|---|---|
| 06.05.2026 06:28 UTC | 100 | 27.01.2027–06.05.2027 | 425–750 |
| 30.07.2026 18:00 UTC | 177 | 03.08.2026–26.01.2027 | 445–650 |

30.07. + 180 Tage = 26.01.2027 — exakt die Grenze. Alles dahinter trug noch die
alten Preisgrenzen (425/750) aus einer früheren Konfiguration. Im Kalender ist
das nicht erkennbar; die Zahlen sehen gleich aus.

**Regel:** Wo eine Berechnung nur ein Fenster abdeckt, bleibt außerhalb der
Altbestand stehen — mit der damaligen Konfiguration. Die Lücke **wandert mit**
jedem Lauf, sie schließt sich nicht von selbst. Entweder regelmäßig rechnen,
`daysAhead` erhöhen, oder Datensätze außerhalb des Fensters als veraltet
kennzeichnen.

Verwandt mit 7.1 („Upsert ohne Aufräumen"): Auch hier bildet der Schreibvorgang
nur ab, was er berührt — nicht, was er zurücklässt.

### 10.6 Stille Fallback-Werte machen Ausfälle unsichtbar

`airroi-sync/index.ts` setzt bei fehlenden API-Daten Standardwerte ein:

```javascript
analytics?.occupancy_rate ?? ... ?? 0.6     // baseOcc
analytics?.average_daily_rate ?? ... ?? 120 // baseAdr
```

Zusätzlich darf der zweite Aufruf (`/markets/metrics/all`) ohne Fehlermeldung
scheitern — dann wird die Saisonkurve aus den eigenen `season_factors`
synthetisiert. In beiden Fällen landen 365 Zeilen mit `source: "airroi"` in
`market_data_cache` und sehen aus wie gemessene Marktdaten.

**Prüfabfrage, um echte von erfundenen Daten zu unterscheiden:**

```sql
select location, count(*) as tage,
       count(distinct avg_price) as verschiedene_preise,
       min(avg_price) as adr_min, max(avg_price) as adr_max,
       max(fetched_at) as zuletzt
from market_data_cache
where source = 'airroi'
group by location;
```

- `adr_min = adr_max = 120` → Totalausfall, reine Fallback-Zahlen
- `verschiedene_preise = 1` → nur Summary-Endpunkt, Saisonkurve synthetisch
- zweistellige Anzahl mit plausibler ADR → echte Daten

**Befund am 03.08.2026:** Neukirchen am Großvenediger, 454 Tage, **4**
verschiedene ADR-Werte (310–324 €), Auslastung 0.224–0.477. Also echte Daten,
aber grob aufgelöst — AirROI hat für die Region nur für wenige Monate
belastbare Zahlen, der Rest wird interpoliert. Die Einschätzung „Region schlecht
abgedeckt" bestätigt sich.

**Nebenbefund:** 454 Zeilen bei 365 pro Lauf. Der Upsert auf `location,date`
überschreibt nur, räumt aber vergangene Tage nie ab (dasselbe Muster wie 7.1).

**Regel:** Ein Standardwert, der bei Ausfall der Datenquelle einspringt, macht
den Ausfall unsichtbar. Entweder er ist als solcher erkennbar (eigenes
`source`-Kennzeichen, `null` statt Zahl), oder der Aufruf schlägt sichtbar fehl.
Verwandt mit 6.5 („Erfolgsmeldung ist nicht Erfolg").

---

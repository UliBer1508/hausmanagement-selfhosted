# Umstellung Wäscheartikel und -preise — 04./05.09.2026

> Ergänzt `Konzept-Waescheartikel-Stammdaten.md` (04.09.) und
> `Konzept-Waeschepreis-vom-Artikel.md` (05.09.).
> Diese Datei hält fest, was tatsächlich gebaut wurde, was dabei gefunden
> wurde und was offen blieb.

---

## 1. Worum es ging

Der Preis der Wäsche hing am **Haus** (`ai_linen_settings.prices`, eine
JSONB-Liste je Haus, von Hand gepflegt). Nachgeschlagen wurde er mit dem
**Set-Schlüssel**. Beides war falsch:

- Teuni stellt eine Sammelrechnung über beide Chalets. Ein hausbezogener
  Preis ist dort fachlich nicht vorgesehen. `import-teuni-invoice` musste
  sich seit Juli mit einer Warnung behelfen, wenn die beiden Listen
  auseinanderliefen.
- Venediger nennt die Bettwäsche-Zeile `bettwaesche`, die Preisliste kannte
  nur `bedding`. Der Schlüssel traf nicht, und der **größte Posten jeder
  Bestellung** fiel still aus der Rechnung.

Sichtbare Folge: eine Bestellung für Venediger mit 4 Gästen wurde mit
**17,50 EUR** geschätzt. Richtig sind **60,00 EUR**.

Ziel: der Preis kommt vom **Artikel**, gefunden über die Artikelnummer an
der Set-Zeile. Kein Schlüsselname entscheidet mehr über Geld.

---

## 2. Was am 04.09.2026 entstand — und was daran fehlte

**Gebaut:**

| Was | Wo |
|---|---|
| Tabellen `laundry_articles`, `laundry_article_prices` | Datenbank |
| Befüllung aus vorhandenen Teuni-Rechnungen | einmalig, Ergebnis: 11 Artikel |
| `useLaundryArticles.ts` | neu |
| Spalte „Teuni-Artikel" als Auswahlliste | `LinenSetRulesTab.tsx` |
| `artikelNachtragen()` — unbekannte Artikel beim Rechnungslesen anlegen | `DocumentsTab.tsx` |

**Was fehlte und am 05.09. auffiel:**

- **Kein SQL im Repo.** Das DDL der beiden Tabellen stand nur im
  Konzeptpapier und im Dashboard. Beim Prüfen des Stands am 05.09. war
  deshalb nicht feststellbar, ob die Tabellen überhaupt existieren — die
  Einschätzung „Schritt 1 nicht gemacht" war falsch und musste revidiert
  werden, nachdem `MWR`, `WT2` und `WTB2` im Sortiment auftauchten (die
  stammen ausschließlich aus alten Rechnungen, also hatte die Befüllung
  stattgefunden).
- **`types.ts` nicht neu erzeugt.** Daher `as any`-Casts in `DocumentsTab`
  und `useLaundryArticles`. Gilt weiterhin.
- **Statuszeile im Konzeptpapier veraltet** — sie sagt „Tabellen definiert,
  noch nicht angelegt", während der Code sie längst beschreibt.

**Lehre:** Struktur, die nur im Dashboard existiert, ist für den nächsten
Arbeitsschritt unsichtbar. Jede DDL gehört als nummerierte Datei nach
`supabase/SQL/`, auch wenn sie im Dashboard ausgeführt wurde.

---

## 3. Das Sortiment (Stand 05.09.2026)

11 Artikel, alle `bestaetigt`, alle aus Rechnungen gewonnen:

| Nr | Bezeichnung | Preis | gültig ab | Abrechnung |
|---|---|---|---|---|
| MW4 | Mietwäsche Paket 5 Tlg | 9,50 | 31.08.2026 | paket |
| MW3 | Mietwäsche Paket 5 Tlg | 9,50 | 31.03.2026 | paket, ersetzt durch MW4 |
| MWR | Mietwäsche pkt | 9,50 | 30.06.2026 | paket, ersetzt durch MW3 |
| MWST | Mietwäsche Saunatuch | 2,80 | 31.03.2026 | stueck |
| MWHT | Mietwäsche Handtuch | 1,50 | 30.06.2026 | stueck |
| MWBVL | Mietwäsche Badevorleger | 1,10 | 30.06.2026 | stueck |
| KLGEW | Kleingewerbe | 0,00 | 31.08.2026 | nicht im Set |
| WT2 / WT3 | Wäsche trocknen / Waschen Trocknen | 2,99 | | nicht im Set |
| WTB2 / WTB3 | dito mit Bügeln | 3,49 | | nicht im Set |

**Drei Befunde daraus:**

*Zwei tote Einträge in den alten Maps.* `MWBT` (Badetücher) und `MWSPLT1`
standen in `ARTIKEL_MAP` und `ARTIKEL_ZU_SCHLUESSEL`, existieren im
Sortiment aber nicht.

*Ein Widerspruch, aufgelöst.* `MWHT` war in `ARTIKEL_MAP` auf
`small_towels` gemappt, in `DocumentsTab:603` auf `sink_towels`. Uli
bestätigte, dass für `sink_towels` (Küchenhandtücher) ein Artikel fehlt —
also meint `MWHT` die Handtücher und die Zuordnung in `DocumentsTab` war
falsch. Beide Maps sind inzwischen wirkungslos.

*Nummernwechsel bei gleicher Leistung.* `MWR → MW3 → MW4`, alle 9,50, alle
„Paket 5 Tlg". Ohne Auflösung friert der Preis an einer alten Nummer ein.

---

## 4. Was gebaut wurde

### 4.1 Datenbank

| Datei | Inhalt |
|---|---|
| `53_waescheartikel_nachfolger.sql` | `nachfolger_id` (Kette MWR→MW3→MW4), `set_faehig` (KLGEW und Lohnwäsche nicht auf Set-Zeilen wählbar) |
| `54_waescheartikel_abrechnungsart.sql` | `abrechnungsart` mit `stueck` (Vorgabe) und `paket` |
| `55_bestellkosten_2026_nachrechnen.sql` | einmalige Nachberechnung von `total_cost` für alle Bestellungen ab 01.01.2026 |
| `56_waescheset_alte_schluessel.sql` | `alte_schluessel` an der Paketzeile beider Häuser |

**Warum `set_faehig` und nicht `status='ignorieren'`:** Für KLGEW und die
Lohnwäsche brauchen wir weiterhin Preise — sie sollen beim Rechnungslesen
geprüft werden, nur nicht auf einer Set-Zeile wählbar sein. `ignorieren`
hieße „beim Rechnungslesen übergehen" und wäre fachlich falsch.

**Warum `abrechnungsart` am Artikel und nicht an der Set-Zeile:** Ob etwas
ein Paket ist, entscheidet Teunis Sortiment, nicht unser Haus. Der Fall,
der es erzwang: `MWHT` steht in **beiden** Häusern auf zwei Zeilen
(Geschirrtücher, WB-Handtücher) und muss **beide Male** berechnet werden —
`MW4` auf mehreren Zeilen dagegen nur **einmal**. Ohne diese Unterscheidung
hätte eine der beiden MWHT-Zeilen still mit 0 gerechnet.

**Warum `alte_schluessel` und kein Umschreiben der Bestellungen:**
Bestellungen halten fest, was geliefert wurde. Für vier der fünf alten
Bettpositionen gäbe es zudem kein Ziel — sie sind im Paket aufgegangen.
Und `total_cost` passte danach nicht mehr zu `items`. Die Liste der
früheren Namen an der Set-Zeile löst dasselbe, ohne Vergangenheit zu
verändern. **Die Reihenfolge zählt:** bei einem Paketartikel bestimmt der
erste vorkommende Eintrag die Menge, deshalb steht `bedding` vorn.

### 4.2 Gemeinsame Logik

`src/lib/linenPricing.ts` (neu). Trägt die Rechnung einmal, statt sie zu
wiederholen. Vorher stand sie an vier Stellen mit **widersprüchlichen**
Ersatzwerten:

| Datei | bedding | kitchen_towels |
|---|---|---|
| `useLinenAI.ts` | 30 | fehlte ganz |
| `check-booking-linen-orders` | 30 | 12 |
| `generate-booking-linen-order` | 30 | 5 |
| `optimize-linen-inventory` | — | pauschal **15 für alles** |

Echte Werte: 9,50 und 1,50. Der Pauschalfallback von 15 EUR lag bei einem
Badvorleger (1,10) um das Dreizehnfache daneben.

Enthalten: `mengenFuerBuchung`, `kostenFuerMengen`, `artikelJeZeile`,
`aktuellerArtikel` (Nachfolgekette, Abbruch nach 10 Schritten),
`setZeileFuerSchluessel` (löst alte Schlüssel auf), `artikelAufteilung`
(gruppiert nach Teuni-Artikel, beachtet die Paketregel).

### 4.3 Frontend

| Datei | Änderung |
|---|---|
| `types/linen.ts` | `preis_zaehlt` je Set-Zeile |
| `LinenSetRulesTab.tsx` | Artikelauswahl nur gültige Artikel; gespeicherter, nicht mehr wählbarer Artikel bleibt sichtbar mit Hinweis; Ankreuzfeld bei Paketgruppen; Speicherbremse; Stift zum Bearbeiten je Zeile |
| `LinenItemDialog.tsx` | Bearbeiten-Modus; **Schlüssel bleibt unverändert**; bestehende Zeile wird erweitert, nicht ersetzt |
| `LinenPricesTab.tsx` | von Eingabemaske zu reiner Anzeige der Teuni-Artikel mit Preis und Gültigkeitsdatum |
| `useLaundryArticles.ts` | `nachfolger_id`, `nachfolger_nummer`, `set_faehig`, `abrechnungsart`; `istWaehlbar()` |
| `LinenOrdersList.tsx` | `houseId`-Eigenschaft; Startfilter korrigiert; `guest_name` aus der Abfrage entfernt |
| `LinenInventoryDialog.tsx` | Bestellliste im Reiter „Bestellübersicht" |
| `LinenOrderAnalytics.tsx` | Preise vom Artikel; Bedarf aus dem Set; Auswertungen nach **Teuni-Artikel** gruppiert |
| `useOptimizedLinenManagement.ts` | Positionen und Mengen aus dem Set statt fester Liste |
| `useBookingLinenOrders.ts` | Fehlerkörper der Edge Function auslesen; `statusError` herausgereicht |
| `BookingLinenOverview.tsx` | Fehler im Wortlaut anzeigen statt „prüfen Sie die Konfiguration" |

### 4.4 Edge Functions

| Funktion | Änderung |
|---|---|
| `generate-booking-linen-order` | Preise über Artikelnummer; Paketregel; **Wäschefarbe korrigiert** |
| `check-booking-linen-orders` | Mengen aus `custom_categories`, Preise vom Artikel; `ai_linen_settings` entfernt |
| `optimize-linen-inventory` | Positionen aus dem Set, Preise vom Artikel, kein Pauschalfallback |

---

## 5. Gefundene Fehler

### 5.1 `bedding` ist an elf Stellen hartcodiert

Kein Haus führt diesen Schlüssel noch: Venediger nennt die Zeile
`bettwaesche`, Wald `bettwaescheset`. Betroffen:
`linenCalculation.ts:90`, `generate-booking-linen-order:238`,
`useOptimizedLinenManagement:72/387`, `optimize-linen-inventory:150`,
`DocumentsTab:602`, `LinenDashboard:347`, `LaundryOrderCard:22/34`,
`LinenOrderDialog:47`.

Konkret behoben: die **Wäschefarbe**. Sie wurde über `itemVariants.bedding`
bestimmt, lief für beide Häuser ins Leere, und jede Bestellung ging mit dem
Rückfallwert `white_striped` hinaus — unabhängig von der Einstellung im
Wäscheset. Jetzt über die Kategorie `Schlafbereich`, ohne festen
Schlüsselnamen. **Die übrigen Stellen sind offen.**

### 5.2 Speichern eines Wäschesets nullt die Altspalten

`LinenSetRulesTab.saveMutation` schreibt bei jedem Speichern
`bedding_per_guest: 0`, `bath_mats_per_booking: 0` und so weiter. Vier
Auswertungen lasen genau diese Spalten:

| Stelle | Schreibweise | Folge bei 0 |
|---|---|---|
| `check-booking-linen-orders:137` | `0 \|\| 1` | 1 Stück je Position und Gast |
| `LinenOrderAnalytics:282` | `0 \|\| 1` | dito |
| `useOptimizedLinenManagement:75` | `if (wert)` | **gar kein Bedarf** — Prognose stand auf null |
| `optimize-linen-inventory:177` | `\|\| 0` | Bedarf 0 |

Das Verhalten gab es schon vorher; wirksam wurde es, als am 05.09. beide
Sets umgestellt und gespeichert wurden. Alle vier sind jetzt auf
`custom_categories` umgestellt.

### 5.3 Bestellliste zeigte nichts

`LinenOrdersList` startete mit `statusFilter = 'offen'` und setzte ihn im
Effekt auf `'offen'`, **wenn** offene Bestellungen existieren — also auf
den Wert, auf dem er ohnehin stand. Gab es keine, blieb er auf `'offen'`
und die Liste war leer. Venediger hat 28 Bestellungen, davon **null** mit
Status `offen`. Jetzt: offene vorhanden → `offen`, sonst `all`.

### 5.4 Auswertung zählte das Paket fünffach

„Top 5 meistbestellte Artikel" zeigte Bettwäsche, Badetücher, Kopfkissen,
Handtücher, Spannbetttücher — je 41 Stück, je 0,00 EUR. Fünf Zeilen für
**ein** Paket, und keine mit Preis, weil die Schlüssel im heutigen Set
nicht mehr vorkommen. Gelöst durch `artikelAufteilung()` plus
`alte_schluessel`.

### 5.5 Datenfehler: Bestellung Maximilian Herr

`a538893c-a6fd-46ad-8ff0-774b7bd62145`, 02.01.2026, Venediger: **16 Stück
je Position bei 6 Gästen**, 104 Teile. Der Betrag stand auf 118,90 EUR —
genau der Wert einer normalen Sechs-Gäste-Bestellung. Die Menge wurde also
nachträglich geändert, ohne dass der Betrag neu gerechnet wurde. Beides
zusammen machte den Fehler unsichtbar.

Korrigiert auf 6 bzw. 44 Teile, `total_cost` auf 84,60 EUR.

---

## 6. Die Nachberechnung 2026

Alle 32 Bestellungen ab 01.01.2026 tragen jetzt einen Betrag aus den
Artikelpreisen. Fünf hatten vorher **keinen** (`null` oder 0,00): Niels
Wlijffels, Adnan Al Mulhim, Henning Fuchs, Luca, Hofmann, Tal Yehuda,
Tobias Kerscher.

Die Beträge sind durchweg um **20–37 EUR gesunken**. Grund: vorher wurde
jede der neun Positionen einzeln bepreist, jetzt zählt das Paket einmal.

Gegenprobe vor dem Schreiben, zwei echte Fälle nachgerechnet:

| Fall | berechnet | in der Datenbank |
|---|---|---|
| Felix Sommer, 5 Gäste, alte Schlüssel | 72,30 | 72,30 |
| Neue Bestellung, 4 Gäste | 60,00 | 60,00 erwartet |

**2025 wurde ausdrücklich nicht angefasst.** Dafür fehlen die Preise: alle
Einträge in `laundry_article_prices` beginnen frühestens am 31.03.2026,
und die Bettwäsche kostete damals 9,00 statt 9,50. Mit heutigen Preisen
gerechnet wäre die Jahressumme 2025 zu hoch.

---

## 7. Das Wäschebestellset — Beispielrechnung Venediger

Stand 05.09.2026, 5 Set-Zeilen:

| Position | Regel | Artikel | Preis |
|---|---|---|---|
| Bettwäsche | 1 pro Gast | MW4 | 9,50 |
| Saunatücher | 1 pro Gast | MWST | 2,80 |
| Badvorleger | 3 pro Buchung | MWBVL | 1,10 |
| WB-Handtücher | 3 pro Buchung | MWHT | 1,50 |
| Geschirrtücher | 2 pro Buchung | MWHT | 1,50 |

**12,30 EUR je Gast plus 7,80 EUR je Buchung.** Vier Gäste ergeben
60,00 EUR, zwei Gäste 32,40 EUR.

---

## 8. Oberpinzgau-Portal: wie mehrere Sets dort gelöst sind

Gelesen am 05.09.2026 aus `oberpinzgau-laundry-hub`.

```
objekte.schnellbestellung_set_id ──→ waeschesets (objekt_id, name,
                                      beschreibung, aktiv)
                                         │
                            waescheset_artikel (set_id, artikel_id, menge)
                                         │
                                    waescheartikel
```

Dazu global: `waescheset_vorlagen` und `waescheset_vorlage_artikel`.

**Drei Beobachtungen:**

- Das Set verweist über einen echten Fremdschlüssel auf den Artikel, nicht
  über einen Textnamen. Dieselbe Richtung wie unsere Umstellung, nur
  konsequenter.
- **Das Standardset hängt am Objekt, nicht am Set.** Kein
  `ist_standard`-Kennzeichen, sondern ein Verweis. Damit kann es nicht zwei
  Standardsets geben und es braucht keine Regel, die das verhindert.
- Ein Set kennt nur `menge` — kein „pro Gast", keine Saison, kein `active`.
  Das genügt dort, weil ein Mensch das Set auswählt. Bei uns erzeugt
  `generate-booking-linen-order` die Bestellung automatisch aus der
  Buchung; `calculation_type`, `availability` und `season` bleiben nötig.

**Vorschlag für uns (nicht umgesetzt):** `linen_set_definitions` hat schon
heute keine Eindeutigkeit auf `house_id` — mehrere Zeilen je Haus sind auf
DB-Ebene bereits möglich. Es fehlen `name`, `beschreibung`, `aktiv` sowie
`houses.standard_linen_set_id`. Die 23 Lesestellen mit `.maybeSingle()`
müssten je um `.eq('id', standard_linen_set_id)` ergänzt werden. Vorlagen
lohnen bei zwei Häusern nicht; „Set duplizieren" leistet dasselbe.

**Offen:** wofür ein zweites Set gebraucht wird. Bei reiner Saisonfrage
genügt `availability: seasonal`, das bereits existiert. Bei Sonderfällen
wäre zu klären, wer das Set beim automatischen Bestellen auswählt.

---

## 9. Offene Punkte

| Punkt | Stand |
|---|---|
| `check-booking-linen-orders` liefert non-2xx | Ursache unbekannt; Funktion umgebaut, `useBookingLinenOrders` liest jetzt den Fehlerkörper aus und zeigt den echten Grund |
| Gegenprobe mit einer Teuni-Rechnung | ausstehend. Die Annahme „Paket 5 Tlg deckt Bettwäsche, Kissenbezüge, Spannbetttuch, Badetücher, Handtücher ab" ist aus Name und Anzahl geschlossen, nicht von Teuni bestätigt |
| Preisliste von Teuni | am 05.09. angefordert |
| Mengenänderung rechnet den Betrag nicht nach | Fall Maximilian Herr, zweimal aufgetreten |
| `bedding` an neun weiteren Stellen hartcodiert | offen |
| `types.ts` kennt die Artikeltabellen nicht | daher `as any` |
| 2025er Bestellungen ohne Betrag | Entscheidung offen: nichts tun / mit heutigen Preisen / alte Preise nachtragen |
| `ai_linen_settings.prices` | wird nicht mehr geschrieben und nicht mehr gelesen; Spalte kann nach Umbenennungstest entfallen |
| Wald: `sauna_towels` ohne Artikel | Zuordnung fehlt |
| Fehlende Artikel im Sortiment | `sink_towels` (Küchenhandtücher), Badetücher |
| Mehrere Wäschesets je Haus | Vorschlag steht, Anwendungsfall offen |
| `ARTIKEL_MAP` / `ARTIKEL_ZU_SCHLUESSEL` | wirkungslos, aber noch im Code |
| Oberpinzgau-Sync (`useExternalSync`, `sync-linen-order-rest`) | toter Pfad, `external_sync_enabled` aus |

---

## 10. Lehren aus dieser Sitzung

**Drei Vermutungen, alle falsch.** Zur leeren Bestellübersicht wurden
nacheinander behauptet: doppelte Zeilen in `linen_set_definitions`
(widerlegt — eine je Haus), die falsch eingesetzte Datei (nein), fehlende
Fremdschlüssel (beide vorhanden). Jedes Mal wäre Lesen schneller gewesen
als Raten. Der Anlass war eine Meldung, die in die Irre führte — siehe
unten.

**Eine Fehlermeldung, die die Ursache verschweigt, kostet Stunden.**
„Keine Daten verfügbar. Bitte prüfen Sie die Konfiguration." erschien
unabhängig davon, ob die Funktion abstürzte, keine Buchungen existierten
oder wirklich etwas fehlkonfiguriert war. Ebenso `functions.invoke`, das
generell nur „Edge Function returned a non-2xx status code" meldet — der
Grund steht im Antwortkörper und wurde weggeworfen.

**Spaltennamen nicht erfinden.** `estimated_cost` gibt es in
`linen_orders` nicht, die Spalte heißt `total_cost`. `types.ts` lag vor,
wurde aber nicht gelesen. Ebenso `jsonb_object_keys_count` — eine Funktion,
die es in PostgreSQL nicht gibt.

**Vor jedem Aufruf zum Speichern prüfen, was das Speichern auslöst.** Zum
Zuordnen der Artikel wurde zweimal zum Speichern aufgefordert, ohne dass
der Speicherpfad gelesen war. Er nullt sämtliche Altspalten — und vier
Auswertungen hingen daran.

**Erst rechnen, dann schreiben.** Die Nachberechnung wurde vor dem
Schreiben gegen zwei echte Bestellungen geprüft. Dabei fiel Maximilian
Herr auf: eine Zeile, die statt zu sinken um 88,70 EUR stieg. Ohne die
Vorschau wäre ein Datenfehler als Betrag festgeschrieben worden.

**Reihenfolge beim Schreiben beachten.** Die Mengenkorrektur bei
Maximilian Herr erfolgte **nach** dem Schreiben der Beträge; der Betrag
blieb auf dem alten Stand und musste einzeln nachgezogen werden.

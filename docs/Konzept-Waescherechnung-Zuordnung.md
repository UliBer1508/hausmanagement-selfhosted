# Konzept: Wäscherechnung → Buchungen zuordnen

> ⚠️ **NACHTRAG 02.09.2026 — Teile dieses Dokuments sind überholt.**
>
> Umgesetzt ist inzwischen der Import über die Dokumentenverwaltung; siehe
> `Session-2026-09-02-Zahlungslink-und-Waescherechnung.md`.
>
> **Widerlegt und NICHT mehr als Grundlage verwenden:**
> - „Ein Paket = ein Gast" — an RG-0082 geprüft und gescheitert. Keine
>   Kombination von 3 Buchungen ergibt die abgerechneten 9 Pakete.
>   Bei RG-0117 wurden 15 Pakete für 13 erfasste Gäste berechnet.
> - „Teuni rechnet je Haus ab (Unschärfe 3 geklärt)" in Abschnitt 2b — das
>   war aus **einer** Rechnung geschlossen und steht gegen den Kommentar in
>   `ImportInvoicePdfDialog.tsx` („Sammelrechnungen über beide Häuser").
>   Ungeklärt.
> - „Die 2 Pakete stammen aus nachträglicher Gästezahl-Erhöhung" — geprüft
>   und widerlegt: `guests_changed_at` ist bei allen Buchungen des Zeitraums
>   null.
> - „MWHT = Küchenhandtücher" — es sind die `sink_towels`.
>
> **Bestätigt geblieben:** die Artikelzuordnung (Abschnitt 1), dass
> `kitchen_towels` nicht berechnet werden, und der Grundsatz, dass der
> Abgleich Abweichungen anzeigt statt sie zu erzwingen.


> Stand: 02.09.2026 · Anlass: Rechnung RG-0117 vom 31.08.2026 (Wäsche Pinzgau)
> Betrifft: `laundry_invoices`, `linen_orders`, `import-teuni-invoice`
> Status: **Konzept, nicht umgesetzt.** Punkt 1 (MW4) ist ein Bugfix und sollte
> unabhängig vom Rest sofort erfolgen.

---

## 0. Abgrenzung zur Entscheidung vom 23.07.2026 — bitte zuerst lesen

`docs/SQL-README.md` hält fest, dass am 23.07.2026 der Trigger
`create_invoice_on_linen_order` **entfernt** wurde, mit der Begründung: Teuni
stellt Sammelrechnungen ohne Aufschlüsselung, „welche Bestellung in welcher
Rechnung steckt, ist fachlich nicht bestimmbar."

**Diese Entscheidung bleibt gültig und wird hier nicht widerrufen.** Sie betraf
die Frage: *Welche einzelne Bestellung gehört zu welcher Rechnungszeile?* Darauf
gibt es weiterhin keine Antwort, weil die Rechnung Mengen **aggregiert** und
keine Bestell- oder Buchungsreferenz enthält.

Dieses Konzept beantwortet eine **andere** Frage:

> Welche **Menge von Bestellungen eines Zeitraums** ergibt in Summe genau die
> Mengen dieser Rechnung?

Das ist ein *Mengenabgleich über eine Periode*, keine zeilenweise Zuordnung.
Er ist prüfbar, weil beide Seiten dieselben Artikel in Stückzahlen führen.

> ⚠️ **Nicht wieder einführen:** einen Trigger, der pro `linen_orders`-INSERT
> eine Rechnungshülle anlegt. Das war der verworfene Ansatz und erzeugte 48
> wertlose Entwürfe.

---

## 1. Verifizierte Artikelzuordnung (Stand 02.09.2026)

Grundlage: `linen_set_definitions.custom_categories`, abgefragt am 02.09.2026.
Beide Chalets (`a2b4d1f7…`, `f5b4588b…`) haben **identische Regeln**.
Ein drittes Haus (`50622818…`) hat `custom_categories = {}` — faellt auf die
Legacy-Spalten zurueck, fuer den Abgleich vorerst ausgeschlossen.

### Die Regeln je Haus

| Schluessel | Label | Regel | Menge |
|---|---|---|---|
| `bedding` | Bettwaesche | per_guest | 1 |
| `spannbetttuch` | Spannbetttuecher | per_guest | 1 |
| `pillow_cases` | Kissenbezuege | per_guest | 1 |
| `large_towels` | Badetuecher | per_guest | 1 |
| `small_towels` | Handtuecher | per_guest | 1 |
| `sauna_towels` | Saunatuecher | per_guest, **seasonal: winter** | 1 |
| `bath_mats` | Badvorleger | per_booking | **3** |
| `sink_towels` | WB-Handtuecher | per_booking | **3** |
| `kitchen_towels` | Geschirrtuecher | per_booking | **2** |

### 1a. `MW4` ist ein BUENDEL, kein Einzelartikel

Die fuenf **ganzjaehrigen per_guest**-Artikel ergeben zusammen genau 5 Stueck
je Gast:

    bedding + spannbetttuch + pillow_cases + large_towels + small_towels = 5

Das ist „Mietwaesche Paket 5 Tlg". `sauna_towels` ist ebenfalls per_guest, aber
`season: winter` — im August faellt es weg, sonst waeren es 6 Teile. Das Paket
passt also **auch saisonal korrekt**.

> **Konsequenz fuer `ARTIKEL_MAP`:** Die Map bildet heute 1 Teuni-Artikel auf
> 1 Systemfeld ab (`MW3 -> 'bedding'`). Das ist zu eng: MW4 deckt **fuenf**
> Felder ab. Die Struktur muss ein Buendel erlauben, sonst zaehlt der Abgleich
> vier Artikel als fehlend.

```ts
MW4: { felder: ['bedding','spannbetttuch','pillow_cases','large_towels','small_towels'],
       pro: 'gast',
       hinweis: 'Paket 5 Tlg = alle ganzjaehrigen per_guest-Artikel. Im Winter kommt sauna_towels HINZU — dann pruefen, ob Teuni 6 Tlg abrechnet oder separat MWST.' },
```

### 1b. `MWHT` ist FALSCH zugeordnet — und es sind nicht die Geschirrtuecher

Aktuell: `MWHT: { feld: 'small_towels' }` (per_guest). Falsch, denn
`small_towels` steckt bereits im MW4-Paket.

Die Arithmetik entscheidet eindeutig, welcher per_booking-Artikel es ist:

| Kandidat | Menge/Buchung | 9 ÷ Menge | Ergebnis |
|---|---|---|---|
| `kitchen_towels` | 2 | 4,5 | **unmoeglich** — keine ganze Buchungszahl |
| `sink_towels` | 3 | 3,0 | ✓ |

→ **`MWHT` = `sink_towels`** (WB-Handtuecher). Der Rechnungstext „Mietwaesche
**Handtuch**" passt dazu auch besser als Geschirrtuecher.

> Die urspruengliche Annahme „MWHT = Kuechenhandtuecher" ist damit **widerlegt**.
> Sie haette 4,5 Buchungen ergeben.

### 1c. Geschirrtuecher werden nicht gemietet

`kitchen_towels` (2/Buchung → 6 Stueck bei 3 Buchungen) taucht auf RG-0117
**gar nicht** auf. Offenbar nicht von Teuni gemietet. Beim Abgleich ist dieser
Schluessel zu ignorieren, sonst entsteht eine Dauerdifferenz.

### Korrigierte Zuordnung

| Teuni | System | Regel |
|---|---|---|
| MW3 / MW4 | Buendel aus 5 per_guest-Artikeln | pro Gast |
| MWST | `sauna_towels` | pro Gast, nur Winter |
| MWHT | `sink_towels` | pro Buchung (3) |
| MWBVL | `bath_mats` | pro Buchung (3) |
| MWBT | `large_towels` **zusaetzlich** zum Paket | zu klaeren |
| WT3 / WTB3 | — | Eigenwaesche nach kg |
| KLGEW | — | immer 0,00 |
| — | `kitchen_towels` | **nicht von Teuni** |

---

## 2. Rechnung RG-0117 — vollstaendig aufgeloest

| Art.Nr | Menge | Rechnung | ergibt |
|---|---|---|---|
| MW4 | 15 Stk | 1 Paket je Gast | **15 Gaeste** |
| MWBVL | 9 Stk | 3 je Buchung | **3 Buchungen** |
| MWHT | 9 Stk | 3 je Buchung | **3 Buchungen** ✓ |
| WT3 | 7,9 kg | Eigenwaesche | — |

Rechenprobe: 142,50 + 13,50 + 9,90 + 23,62 + 0,00 = **189,52 EUR** ✓

→ **3 Buchungen mit zusammen 15 Gaesten**, im Schnitt 5 je Buchung.

**Damit ist die Grundfrage beantwortet:** Die Rechnung sagt sehr wohl, fuer wie
viele Gaeste sie war. Die Einschaetzung vom 23.07.2026 („nicht bestimmbar") galt
der Zeilenebene und bleibt dort richtig — auf der Mengenebene ist sie widerlegt.

### Rangfolge der Verlaesslichkeit — WICHTIG

Nicht alle Positionen sind gleich belastbar:

| Rang | Position | Warum |
|---|---|---|
| **1 — hart** | MW4 → **Gaestezahl** | Wird je Gast gepackt. Kein Vorratspuffer denkbar. |
| **2 — weich** | per_booking → **Buchungszahl** | Kann durch Vorratslieferungen verfaelscht sein. |

Uli am 02.09.2026: Es kommt vor, dass **zu viele Badvorleger** geliefert werden.
Dann entspricht MWBVL ÷ 3 **nicht** der Buchungszahl, ohne dass ein Fehler
vorliegt.

> **Fuer die Umsetzung bindend:** Der Abgleich **darf nicht verlangen**, dass
> die per_booking-Positionen aufgehen. Er ankert an MW4 (Gaestezahl); die
> uebrigen Positionen sind Plausibilitaetspruefung mit erlaubter Abweichung
> nach oben. Bei RG-0117 stimmen sie zufaellig exakt — das ist der Gluecksfall,
> nicht die Regel.

### Verbleibende Unschaerfen

1. **Kein Startdatum.** „Lieferung bis 31.8.26" nennt nur das Ende; der Beginn
   ergibt sich aus der Vorgaengerrechnung → lueckenlose Folge noetig.
2. **Lieferdatum ≠ Bestelldatum.** Abgleich auf `linen_orders.delivery_date`.
3. **Ein Haus oder beide?** Lieferadresse Venedigersiedlung 316. Beide Chalets
   haben identische Regeln — aus den Mengen allein ist **nicht** unterscheidbar,
   welches Haus gemeint ist. Ungeklaert.
4. **Winterrechnungen.** Dann kommt `sauna_towels` hinzu. Ob Teuni dann „6 Tlg"
   abrechnet oder MW4 + MWST getrennt, ist an einer Winterrechnung zu pruefen.
5. **MWBT** (Badetuecher) — `large_towels` steckt bereits im Paket. Wofuer steht
   MWBT dann? An einer aelteren Rechnung pruefen.

---

## 2b. REALABGLEICH RG-0117 gegen die echten Bestellungen (02.09.2026)

Abfrage `linen_orders`, `delivery_date` 01.–31.08.2026: **5 Bestellungen**,
alle mit `laundry_invoice_id = null`, keine nach dem 15.08.

| Datum | Haus | Gaeste | bath_mats | sink_towels | kitchen_towels |
|---|---|---|---|---|---|
| 01.08. | a2b4d1f7 | 4 | 3 | 3 | 2 |
| 08.08. | f5b4588b | 2 | 3 | 3 | 2 |
| 08.08. | a2b4d1f7 | 5 | 3 | 3 | 2 |
| 15.08. | f5b4588b | 6 | 3 | 3 | 2 |
| 15.08. | a2b4d1f7 | 4 | 3 | 3 | 2 |

### Befund A — Teuni rechnet JE HAUS ab (Unschaerfe 3 geklaert)

| | Bestellungen | Gaeste | bath_mats | sink_towels |
|---|---|---|---|---|
| **a2b4d1f7** | **3** | 13 | **9 ✓** | **9 ✓** |
| f5b4588b | 2 | 8 | 6 | 6 |
| beide | 5 | 21 | 15 ✗ | 15 ✗ |

Haus `a2b4d1f7` trifft **beide** per_booking-Positionen exakt. Zusammen mit der
Lieferadresse „Venedigersiedlung 316" auf der Rechnung: **RG-0117 betrifft nur
dieses eine Haus.**

> **Fuer die Umsetzung bindend:** Der Abgleich MUSS nach `house_id` filtern.
> Ohne Hausfilter gibt es zwei rechnerisch gueltige 3er-Kombinationen fuer
> 15 Gaeste — beide mischen die Haeuser und sind Artefakte. Ein Mengenabgleich
> ohne Hausfilter ist **mehrdeutig** und darf nie allein entscheiden.

### Befund B — 2 Pakete mehr berechnet als bestellt

Teuni berechnet **15** Pakete, die drei Bestellungen ergeben **13** Gaeste
(4 + 5 + 4). Die per_booking-Artikel stimmen dagegen **exakt**.

Eine Abweichung ausschliesslich bei der **pro Gast** berechneten Position, bei
gleichzeitig exakten pro-Buchung-Positionen, deutet auf eine **nachtraeglich
erhoehte Gaestezahl**: Wird die Gaestezahl nach Erstellung der
Waeschebestellung erhoeht, liefert Teuni fuer die tatsaechliche Personenzahl,
`linen_orders.items` bleibt aber auf dem alten Stand.

> **Vermutete Systemluecke — noch zu verifizieren:** Bei Aenderung von
> `bookings.number_of_guests` wird die zugehoerige `linen_orders`-Zeile nicht
> nachgefuehrt. Pruefen: Gab es im Zeitraum Buchungen mit gesetztem
> `guests_changed_at` bzw. `booked_guests` fuer Haus `a2b4d1f7`?
>
> ```sql
> select b.id, b.check_in, b.number_of_guests, b.booked_guests,
>        b.guests_changed_at, b.guest_surcharge_amount
> from bookings b
> where b.house_id = 'a2b4d1f7-f396-40a5-b83f-174ccafa55fd'
>   and b.check_in >= '2026-07-25' and b.check_in <= '2026-08-31'
> order by b.check_in;
> ```
> Ergibt die Summe der Erhoehungen genau 2, ist die Luecke belegt.

**Konsequenz fuer den Abgleich:** Eine Differenz bei den Paketen ist **nicht
automatisch ein Rechnungsfehler**. Der Abgleich soll sie anzeigen und auf
Gaestezahl-Aenderungen im Zeitraum hinweisen, statt Alarm zu schlagen.

### Befund C — Geschirrtuecher werden nicht berechnet (bestaetigt)

Die drei Bestellungen enthalten **6 Geschirrtuecher** (2 × 3). Auf RG-0117 gibt
es dafuer **keine Position**, und MWHT steht auf 9, nicht auf 15.

> Waeren `sink_towels` und `kitchen_towels` derselbe Artikel, muesste Teuni
> 15 Stueck berechnen. Sie berechnet 9 — also **nicht derselbe Artikel**, oder
> die Geschirrtuecher werden nicht gemietet. Ein Zusammenlegen der beiden
> Schluessel ist damit **nicht angezeigt**; `kitchen_towels` bleibt bestehen und
> wird beim Abgleich ignoriert.

### Befund D — Periode endet vor dem Rechnungsdatum

Trotz „Lieferung bis 31.8.26" gibt es **keine Lieferung nach dem 15.08.** Offen:
keine Buchungen in der zweiten Augusthaelfte, oder Lieferungen nicht erfasst.
An der naechsten Rechnung pruefen.

### Zwischenstand

Das Verfahren **traegt** — mit Hausfilter treffen beide per_booking-Positionen
exakt. Die urspruengliche Ableitung „15 Gaeste" aus der Rechnung allein war
insofern zu grob: Es sind 13 erfasste Gaeste plus 2 vermutlich nachtraeglich
hinzugekommene.

---

## 3. Vorgeschlagenes Verfahren: Periodenabgleich

**Grundsatz:** Das System **schlägt vor und rechnet gegen**, es **entscheidet
nicht**. Bestätigt wird immer von Hand — die bestehende
`AssignOrdersToInvoiceDialog.tsx` ist dafür schon da.

### Schritt 1 — Periode bestimmen
- `bis` = Datum aus „Lieferung bis …" (bereits im PDF vorhanden, wird derzeit
  **nicht** extrahiert → neue Regex nötig)
- `von` = `bis` der letzten Rechnung mit kleinerer `rechnungsnummer`, + 1 Tag
- Fehlt eine Vorgängerrechnung: Periode offen lassen und Nutzer fragen, statt zu raten

### Schritt 2 — Ist-Mengen aus den Bestellungen bilden
Alle `linen_orders` mit `delivery_date` in der Periode und noch ohne
`laundry_invoice_id`. Deren `items` (JSON, Schlüssel = `feld`-Namen) je Schlüssel
aufsummieren.

### Schritt 3 — Soll-Mengen aus der Rechnung bilden
`positionen` über `ARTIKEL_MAP` von Art.Nr auf `feld` abbilden. Artikel mit
`feld: null` (WT3, WTB3, KLGEW, MWSPLT1) überspringen.

### Schritt 4 — Vergleichen und einstufen

| Fall | Bedeutung | Vorschlag |
|---|---|---|
| Alle Mengen identisch | Periode vollständig erklärt | Zuordnung vorschlagen, ein Klick zum Bestätigen |
| Rechnung > Bestellungen | Lieferung ohne erfasste Bestellung | Differenz je Artikel anzeigen |
| Rechnung < Bestellungen | Bestellung nicht (oder später) berechnet | Differenz je Artikel anzeigen |
| Artikel unbekannt | Sortiment erweitert | Warnung, `ARTIKEL_MAP` ergänzen |

**Kein Teil-Automatismus bei Abweichung.** Wer bei Differenz „das Naheliegendste"
zuordnet, erzeugt genau die Scheingenauigkeit, wegen der der alte Trigger
entfernt wurde.

### Schritt 5 — Festschreiben
Erst nach Bestätigung `linen_orders.laundry_invoice_id` auf die Rechnung setzen
(Mechanik existiert in `useLaundryInvoices.ts`). Danach mit `SELECT` gegenprüfen —
UPDATE ohne `RETURNING` meldet keine Zeilen (Lesson 9.2).

---

## 4. Sofort ausführbare Prüfung für RG-0117

Bevor irgendetwas gebaut wird: **Trägt die Hypothese überhaupt?** Diese Abfragen
beantworten das ohne jede Codeänderung.

```sql
-- (a) Bestellungen im mutmaßlichen Zeitraum August 2026
select id, house_id, delivery_date, total_items, items, laundry_invoice_id
from linen_orders
where delivery_date >= '2026-08-01' and delivery_date <= '2026-08-31'
order by delivery_date;

-- (b) Vorgängerrechnung finden — bestimmt den echten Periodenbeginn
select rechnungsnummer, rechnungsdatum, nettobetrag, positionen
from laundry_invoices
order by rechnungsdatum desc
limit 5;
```

**Abgleich von Hand:** Aus (a) die `items` je Schlüssel summieren und gegen die
Rechnung halten:

| Schluessel | Rechnung RG-0117 | Summe aus (a) | ? |
|---|---|---|---|
| `bedding` | 15 | | |
| `sink_towels` | 9 | | |
| `bath_mats` | 9 | | |

**Zusaetzlich zu pruefen:** Enthaelt (a) genau **3 Bestellungen** mit zusammen
**15 Gaesten**? Das ist die direkteste Gegenprobe der Ableitung aus Abschnitt 2.

**Wenn diese drei Zeilen aufgehen, ist das Verfahren tragfähig** und der Ausbau
lohnt. Gehen sie nicht auf, muss zuerst die Ursache geklärt werden (Periode
falsch, Lieferungen ohne Bestellung, beide Häuser gemischt) — dann wäre eine
Automatisierung verfrüht.

---

## 5. Umsetzungsreihenfolge

1. **`MW4` in `ARTIKEL_MAP`** ergänzen (unabhängig sinnvoll, Zusammensetzung bei
   Teuni bestätigen lassen) → Edge-Function-Deploy nötig
2. **Prüfung aus Abschnitt 4** von Hand durchführen → Go/No-Go
3. Bei Go: „Lieferung bis"-Datum im Extraktor auslesen und in `laundry_invoices`
   ablegen (neue Spalte `lieferung_bis` — vorher als SQL im Dashboard anlegen)
4. Abgleichsansicht in `AssignOrdersToInvoiceDialog.tsx` ergänzen: Soll/Ist je
   Artikel, Differenzspalte, Bestätigen-Knopf
5. Dokumentieren: dieses Konzept in `docs/CODE-INDEX.md` verlinken und in
   `SQL-README.md` einen Verweis setzen, damit die Abgrenzung zum Trigger von
   2026-03 auffindbar bleibt

---

## 6. Offene Fragen an Teuni / zu klären

- Ist MW4 inhaltlich identisch mit MW3 (5-teiliges Paket)?
- Wird je Haus getrennt oder gesammelt abgerechnet?
- Ist „Lieferung bis" immer gesetzt, und schließt die Periode lückenlos an die
  Vorrechnung an?
- Woraus besteht das 5-teilige Paket genau? (Seit MW3 offen — betrifft jede
  Kalkulation, nicht nur diesen Abgleich.)

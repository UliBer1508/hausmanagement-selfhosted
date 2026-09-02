# Session 02.09.2026 — Zahlungslink, Buchungskarten, Wäscherechnung

Drei getrennte Vorgänge an einem Tag. Alle drei sind umgesetzt und eingespielt.

---

## 1. Zahlungslink ließ sich nicht erstellen

**Symptom:** „Zahlungslink erstellen & an Gast senden" blieb im Ladezustand hängen.

**Ursache:** `supabase/functions/create-payment-link/index.ts` initialisierte Stripe ohne
`httpClient`. Die Stripe-Node-SDK greift dann auf Node's `http`/`https` zurück, was in
der Deno Edge Runtime nicht zuverlässig funktioniert — der Aufruf hängt, statt sauber
zu fehlern. `stripe-webhook/index.ts` machte es an derselben Stelle bereits richtig; die
Zwillingsstelle war nie angeglichen worden.

**Änderung:**

```ts
const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),   // war nicht gesetzt
});
```

Zusätzlich ein unbenutztes `line_items`-Array mit `price_data` entfernt (toter Code —
die Preise werden über `stripe.prices.create()` erzeugt).

**Deployment:** Edge Function, über den Supabase-Dashboard-Editor.

---

## 2. Buchungskarte verhielt sich in „Übersicht" anders als in „Buchungen"

**Symptom:** Derselbe Bearbeiten-Dialog funktionierte im Tab „Buchungen", im Tab
„Übersicht" nicht.

**Ursache — zwei verifizierte Unterschiede:**

**(a) Fehlende Spalten.** `BookingOverviewFixed.tsx` (Buchungen) lädt `booked_guests`,
`guest_surcharge_amount` und `guests_changed_at`. Die Abfrage `dashboard-bookings-v2` in
`OriginalDashboard.tsx` (Übersicht) lud sie nicht. Folgen dort:

- `baselineGuests` (CreateBookingForm, ~Z.150) rechnet `booked_guests ?? number_of_guests`.
  Ohne die Spalte rechnete die Übersicht mit der **aktuellen** statt der eingefrorenen
  Gästezahl.
- `persistCharges()` prüft `if (booked_guests == null)` — in der Übersicht **immer wahr**,
  also wurde `booked_guests` bei jeder Änderung neu überschrieben, obwohl es laut
  Kommentar nur einmal gesetzt werden darf.
- Das Badge „gebucht X → Y" in `BookingCard.tsx` (~Z.246) konnte dort nie erscheinen.

**(b) Realtime-Rennen.** Nur `OriginalDashboard.tsx` horcht per Realtime auf jede
Änderung an `bookings`. `persistCharges()` schreibt mitten im Zahlungslink-Ablauf in
`bookings` → Refetch → **neues** `initialData`-Objekt → der `useEffect` mit
`[initialData, …]` feuerte `form.reset()` während der Vorgang lief. Im Buchungen-Tab
gibt es diese Subscription nicht.

**Änderungen:**
- `src/pages/OriginalDashboard.tsx`: die drei Spalten ergänzt
- `src/components/Bookings/CreateBookingForm.tsx`: Dependency von `initialData` auf
  `initialData?.id` — ein Refetch derselben Buchung setzt das Formular nicht mehr zurück

**Beinahe-Fehler, dokumentiert weil lehrreich:** Der erklärende Kommentar stand zuerst
**innerhalb** des `.select()`-Template-Strings. Das ist kein JS-Kommentar, sondern Text,
der an PostgREST gesendet worden wäre — die Abfrage hätte gefehlt. esbuild meldet das
nicht, weil es syntaktisch gültiger String-Inhalt ist. Kommentare gehören **vor** den
Template-String.

---

## 3. Wäscherechnung wird beim Ablegen gelesen und den Buchungen zugeordnet

### Was es jetzt gibt

Im Ablage-Dialog der Dokumentenverwaltung erkennt „Dokument lesen" zusätzlich, ob der
Absender ein Dienstleister mit `service_type = 'laundry'` ist. Wenn ja, geht dieselbe
Datei an `import-teuni-invoice`, und es erscheint:

- Rechnungskopf (Nummer, Datum, Betrag) und die Positionstabelle
- die Wäschelieferungen des Abrechnungszeitraums, **automatisch angehakt**
- eine Gegenrechnung je Artikel: Menge laut Rechnung gegen Menge laut Auswahl
- ein Haken „Rechnung anlegen und verknüpfen"

Beim Ablegen: Datei → OneDrive, `documents`-Zeile, Rechnung in `laundry_invoices`, dann
`laundry_invoice_id` auf den gewählten Bestellungen **und** auf dem Beleg. Über
`linen_orders.booking_id` hängt die Rechnung damit an den Buchungen.

**Reihenfolge bewusst so:** Scheitert der Upload, entsteht keine Rechnung ohne Beleg.
Scheitert die Rechnung, liegt die Datei bereits richtig und der Vorgang ist wiederholbar.

### Kein neues Kennzeichen nötig

Die Auslösung nutzt `service_providers.service_type` (Enum `cleaning` | `laundry`), das
es längst gibt. Ein zuvor erwogener Eintrag an `document_vendors` war doppelt falsch:
überflüssig, und in der falschen Tabelle — `document_vendors` ist laut
`52_dokumente_ablageorte.sql` ausdrücklich für Absender **ohne** eigenes Objekt gedacht,
Teuni ist ein `service_provider` mit Aufträgen und Portal.

### Neue Spalte: `service_providers.dokument_begriffe`

```sql
alter table public.service_providers add column if not exists dokument_begriffe text[];

update service_providers
set dokument_begriffe = array['Christiaan van den Berge','Rupert Steger Gasse 16']
where name = 'Teuni';
```

**Warum.** Der Dienstleister heißt im System „Teuni". Auf seiner Rechnung steht dieses
Wort nirgends. Stattdessen steht dort „Wäsche Pinzgau", der Inhabername und die
Mailadresse — und `pdfToText()` verliert bei dieser Rechnung ausgerechnet die Zeilen
„Wäsche Pinzgau" und `waeschepinzgau@gmail.com`, während die Zeilen direkt darüber und
darunter ankommen (siehe offener Punkt unten). Übrig bleibt als verlässlicher Anker der
Inhabername.

Ohne diese Begriffe gewann „Gemeinde Neukirchen" mit 2,00 Punkten — über den Ortsnamen
aus Ulis **eigener** Anschrift, der in jedem an ihn adressierten Dokument steht. Mit den
Begriffen kommt Teuni auf 9,60 und steht auf Platz 1. Beide Zahlen wurden am echten PDF
mit dem echten Extraktor gemessen, nicht geschätzt.

Dieselbe Klasse Problem wie bei den Häusern, wo es über `adressBegriffe()` bereits gelöst
war. Dienstleister wurden bis dahin **nur** unter ihrem internen Namen gesucht.

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/components/Documents/DocumentsTab.tsx` | Rechnungserkennung, Bestellzuordnung, Gegenrechnung, Providererkennung über Alias/Mail/`dokument_begriffe` |
| `supabase/functions/import-teuni-invoice/index.ts` | `MW4` und `MWR` in `ARTIKEL_MAP`; Artikelnummern werden groß verglichen |
| `supabase/SQL` | `documents.laundry_invoice_id`, `service_providers.dokument_begriffe` |

`MW4` fehlte in `ARTIKEL_MAP`, obwohl ein Kommentar den Wechsel MW3 → MW4 bereits
vermerkte. Folge: Bei RG-0117 lief die größte Position (142,50 von 189,52 EUR) in den
Zweig „Unbekannter Artikel". `MWR` ist die Schreibweise auf Rechnungen bis Juni 2026.

### Absichtlich robust gebaut

Die Providerabfrage holt `dokument_begriffe` **getrennt**. PostgREST antwortet mit einem
Fehler, wenn eine Spalte fehlt — nicht mit einem leeren Feld. Solange die Spalte fehlte,
brach die gesamte Abfrage ab, die Providerliste war leer, und es wurde **überhaupt kein**
Dienstleister mehr erkannt. Ohne sichtbaren Fehler. Das hat mehrere Testrunden gekostet.

### Noch nicht angefasst

Der alte Weg im Provider-Tab (`ImportInvoicePdfDialog`, der „Sync"-Knopf für die tote
REST-Schnittstelle, der 465-Zeilen-Zwilling `ServicePortal/GuestContactAlertBanner.tsx`)
bleibt bestehen, bis der neue Weg im Betrieb bestätigt ist.

---

## 4. Erkenntnisse zu Teunis Rechnungen

### Belegt

- **Artikelzuordnung.** MW3/MW4/MWR = Wäschepaket pro Gast · MWHT = `sink_towels`
  (3 pro Buchung) · MWBVL = `bath_mats` (3 pro Buchung) · MWST = `sauna_towels`
  (nur Winter) · WT/WTB = Eigenwäsche nach Gewicht, kein Gastbezug
- **`kitchen_towels` werden nicht berechnet.** Drei Bestellungen enthielten 6 Geschirr-
  tücher, auf RG-0117 gibt es dafür keine Position. Beim Abgleich zu ignorieren.
- **`sink_towels` und `kitchen_towels` sind nicht dasselbe.** Wären sie es, müsste Teuni
  15 statt 9 berechnen. Ein Zusammenlegen der Schlüssel ist nicht angezeigt.
- **Artikelnummern ändern sich.** Juni 2026: `mwr`, `mwht`, `Wt2` (klein/gemischt).
  August 2026: `MW4`, `MWHT`, `WT3`. `positionen` hat zudem **zwei** Formate — der
  PDF-Import schreibt `{artikel, preis, summe}`, der frühere REST-Sync schrieb
  `{artikelnummer, einzelpreis, gesamtpreis}`. Nur 2 von 6 Rechnungen haben überhaupt
  Positionen.

### Widerlegt — bitte nicht wiederbeleben

**„Ein Paket = ein Gast" trägt nicht.** Geprüft an zwei Rechnungen:

| Rechnung | Pakete | Buchungen | erfasste Gäste |
|---|---|---|---|
| RG-0082 (Juni) | 9 | 3 | keine Kombination ergibt 9 |
| RG-0117 (August) | 15 | 3 | 13 |

Einmal zu wenig, einmal zwei zu viel. Die naheliegende Erklärung — nachträglich erhöhte
Gästezahlen — wurde geprüft und **widerlegt**: Bei allen fünf Buchungen des Zeitraums ist
`guests_changed_at` null und `booked_guests` gleich `number_of_guests`.

Die Pro-Buchung-Artikel stimmten dagegen in beiden Rechnungen exakt (je 9 = 3 × 3).

**Offen bleibt daher**, warum die Paketmengen abweichen. Kandidaten: Vorratslieferung,
Zusatzbett (`MWSPLT1` existiert als Artikel), Ersatz für beschädigte Teile, oder Teuni
zählt anders als angenommen. Zwei Rechnungen sind zu wenig für eine Regel — deshalb ist
der Import die Voraussetzung, nicht das Ergebnis.

**Konsequenz für den Abgleich:** Er verlangt **keine** Übereinstimmung. Die Gegenrechnung
zeigt Abweichungen an und blockiert nichts. Wer bei Differenz automatisch zuordnet,
erzeugt genau die Scheingenauigkeit, wegen der der Rechnungs-Trigger am 23.07.2026
entfernt wurde.

---

## 5. Offene Punkte

**`pdfText.ts` verliert Zeilen.** Bei RG-0117 fehlen „Wäsche Pinzgau" und
`waeschepinzgau@gmail.com` im ausgelesenen Text, obwohl die Zeilen davor und danach
ankommen — vermutlich Schrift- oder Kodierungssache. Betrifft potenziell jedes Dokument
und ist bisher nur umgangen, nicht behoben.

**Grundsatz in `52_dokumente_ablageorte.sql` widerspricht dem Code.** Dort steht als
„ausdrücklich bestätigt": *„Dokumentinhalte werden NICHT ausgelesen und NICHT in
Positionen zerlegt."* Genau das geschieht jetzt. Der Grundsatz gehört als bewusst
revidiert vermerkt, sonst wird es später zurückgebaut — wie beim Trigger vom März.

**Altbestand.** Seit dem 23.07.2026 ist `laundry_invoice_id` bei allen Bestellungen null.
Die Liste außerhalb des Zeitraums ist entsprechend lang; sie leert sich beim Durcharbeiten
der 15 vorhandenen Rechnungen.

**Weiterhin ungeklärt:** Rechnet Teuni je Haus oder über beide? Der Kommentar in
`ImportInvoicePdfDialog.tsx` sagt „über beide", die Mengen von RG-0117 passen exakt auf
**ein** Haus. Zwei Rechnungen reichen nicht für eine Entscheidung.

**Nicht angefasst:** Provider-Tab aufräumen (siehe oben), Winterrechnung mit
`sauna_towels` prüfen, Bedeutung von `MWBT` klären.

---

## 6. Lehren aus dieser Session

**esbuild prüft nur Syntax.** Zweimal an einem Tag bestätigt: der Kommentar im
PostgREST-String (Abschnitt 2) und ein `useEffect`, dessen Dependency-Liste auf ein erst
später deklariertes `const` zugriff — Zugriff in der temporalen Todeszone, die Seite
stürzte ab. „Syntax OK" ist keine Absicherung. Bei Änderungen an großen Komponenten
zusätzlich prüfen, ob ein Bezeichner vor seiner Deklaration verwendet wird.

**Kopiespalten nicht neu verwenden.** Beim Bauen wäre beinahe `bookings.guest_name`
abgefragt worden — eine Spalte, die in Etappe 6 verschwindet. Das hätte eine 29.
Fundstelle geschaffen. Jetzt über `guests!bookings_guest_id_fkey(name)` und
`getGuestName()`.

**Fehlende Spalte reißt die ganze Abfrage mit.** Bekannt, aber unterschätzt: Der Ausfall
war unsichtbar, weil das Ergebnis wie „nichts gefunden" aussah. Bei optionalen Spalten
getrennt abfragen.

**Am echten Objekt messen statt schließen.** Die Ursache der Providererkennung wurde erst
gefunden, als der echte Extraktor gegen das echte PDF lief. Drei Runden davor beruhten auf
plausiblen, aber falschen Vermutungen — erst über Wortgrenzen, dann über Stammdaten.

**Aus Annahmen keine Schlüsse ableiten.** Die Regel „ein Paket = ein Gast" wurde aus
`linen_set_definitions` hergeleitet und stimmte an einer Rechnung. Erst der Test an einer
**zweiten** widerlegte sie. Uli hatte von Anfang an darauf hingewiesen, dass das
Wäschesystem auf Annahmen beruht.

**Der SQL-Editor führt markierten Text aus.** Mehrzeilige Anweisungen sind teilweise
ausgeführt worden (nur die erste Zeile), ohne dass das auffiel. Anweisungen einzeln
absetzen und mit `select` gegenprüfen — `alter`/`update` melden keine Zeilen.

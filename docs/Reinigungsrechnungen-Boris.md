# Reinigungsrechnungen — Boris

> Angelegt 03.09.2026. Beschreibt den Weg einer Rechnung von Borislav
> Pantelic (Reinigung & Hausbetreuung) von der PDF-Datei bis zur
> verknuepften Reinigung.

## Warum es das gibt

Fuer Waescherechnungen existierte `laundry_invoices`. Fuer Reinigungen gab
es **nichts**: Kosten standen nur je Auftrag in
`service_tasks.cleaning_cost`, ein Rechnungsbezug fehlte. Boris' Rechnung
002048/2026 fuehrt fuenf Reinigungen in zwei Haeusern ueber zwei Monate zu
750 EUR netto — diese Klammer liess sich nirgends abbilden. Der
Bezahltstatus wurde Auftrag fuer Auftrag von Hand gesetzt.

Amela stellt **keine** Rechnungen. Fuer sie bleibt es bei der
Handabrechnung ueber den `ProviderBillingDialog`; es gibt keinen Beleg,
gegen den man abgleichen koennte.

## Der Ablauf

1. Dokumentenablage oeffnen, Datei **vom PC** waehlen
2. **„Dokument lesen"** — die Absendererkennung findet Boris
   (`service_type = 'cleaning'`), daraufhin laeuft `import-boris-invoice`
3. Vorschau: Kopfdaten, alle Positionen, je Position das Ergebnis der
   Zuordnung
4. Nach Freigabe (Haken) entsteht beim Ablegen in einem Zug:

| Tabelle | was geschrieben wird |
|---|---|
| `cleaning_invoices` | die Rechnung, `status = 'offen'` |
| `service_tasks` | `cleaning_invoice_id` bei den erkannten Reinigungen |
| `documents` | `cleaning_invoice_id` beim Beleg |

**`payment_status` wird nicht angefasst.** Eine Rechnung zu erhalten
heisst nicht, sie bezahlt zu haben — Boris' Rechnung nennt ausdruecklich
eine Frist von sieben Tagen. Auf `paid` gehen die Reinigungen erst, wenn
die RECHNUNG auf bezahlt gesetzt wird; das erledigt dann der Trigger
`trg_cleanings_paid_on_invoice_paid`. Ein Klick statt fuenf.

## Die Entscheidungen und ihre Gruende

### Eigene Tabelle statt gemeinsamer `provider_invoices`

Konzeptionell waere ein gemeinsames Dach sauberer — eine Rechnung ist eine
Rechnung, gleich von wem. Es haette aber bedeutet, **21 Zugriffsstellen**
auf `laundry_invoices` in **zwei getrennt ausgelieferten Repos**
(Hausverwaltung, Teuni-Portal) gleichzeitig umzustellen. PostgREST
antwortet bei fehlender Tabelle oder Spalte mit einem FEHLER, nicht mit
einem leeren Ergebnis; genau dieses Muster hat bei der
Gastdaten-Entdopplung zwei Produktionsausfaelle verursacht. Zwischen den
beiden Deploys waere mindestens eine Version kaputt gewesen.

**Bewusst in Kauf genommene Schuld:** Zwei Rechnungstabellen mit
aehnlichem Aufbau. Eine Auswertung ueber alle Dienstleister braucht ein
`UNION`; Aenderungen am Rechnungskonzept muessen an zwei Stellen passieren.
Kommt ein dritter Dienstleister mit Rechnungen, wird es die dritte
Tabelle. Der Weg zu einem gemeinsamen Dach bleibt offen — von zwei
sauberen Tabellen aus ist er genauso moeglich wie vorher.

### Eigene Edge Function statt gemeinsamem Leser

`import-boris-invoice` enthaelt rund 380 Zeilen PDF-Textextraktion, die
mit `import-teuni-invoice` **identisch** sind. Sauberer waere ein Modul
unter `_shared/`. Entschieden wurde dagegen, damit eine Aenderung am
Boris-Format die laufende Teuni-Verarbeitung nicht gefaehrden kann.

**Folge, die jeder kennen muss:** Ein Fehler im Leser ist an ZWEI Stellen
zu beheben. Wer eine der Dateien im Extraktionsteil aendert, prueft die
andere mit. Das ist der Doppelgaenger-Fall aus den Projektregeln, hier
sehenden Auges eingegangen.

### Zuordnung ueber Datum + Haus, ohne Zeitfenster

Boris nennt in jeder Zeile Datum und Objekt. Gesucht wird eine Reinigung
dieses Hauses an **genau** diesem Tag — kein „naechstgelegener Termin",
kein Toleranzfenster.

Der Grund zeigte sich sofort: Rechnung 002048/2026 nennt Venediger am
**5.8.**, im System stehen fuer Venediger der 29.7. und der 9.8. Ein
Zeitfenster von wenigen Tagen haette den 5.8. still auf den 9.8. gelegt
und die Abweichung verschluckt. So bleibt sie sichtbar und wird mit Boris
geklaert.

Vier Ergebnisse je Position: `eindeutig`, `kein_treffer`, `mehrdeutig`,
`haus_unbekannt`. Bei mehreren Kandidaten wird **nicht geraten**.

### Die Function schreibt nichts

Wie bei Teuni: lesen, pruefen, vorschlagen. Angelegt wird vom Frontend
nach Freigabe. Bei Geld setzt keine automatische Erkennung einen Betrag,
den niemand angesehen hat — dasselbe Prinzip wie `draft` bei
Reinigungsterminen.

### Umsatzsteuer: erst lesen, dann rechnen

Bei 002048/2026 wurden Netto (750) und Brutto (900) sauber gelesen, Satz
und Betrag blieben **leer**. Der Unterschied zwischen den Regeln ist das
Prozentzeichen — nur `RE_SATZ` und `RE_MWST` verlangen es.

**Die Ursache ist nicht nachgewiesen.** Vermutet wird, dass das Zeichen
aus der Textextraktion nicht sauber herauskommt. Statt eine Regel auf eine
Vermutung hin umzubauen, wird gerechnet: Netto und Brutto stehen fest,
alles andere ergibt sich zwingend. Gelesene Werte haben Vorrang; gerechnet
wird nur, was fehlt, und die Vorschau weist darauf hin.

Bei unplausiblen Werten (Brutto kleiner als Netto, Netto fehlt) bleibt das
Feld **leer**, statt etwas Falsches zu speichern.

Die Selbstpruefung „Netto + MwSt = Brutto" laeuft nur bei GELESENEN
Werten. Bei gerechneten wuerde sie sich selbst bestaetigen.

### Haeuser ueber `dokument_begriffe`, nicht ueber den Namen

Boris schreibt „Apartment Reinigung in **Wald, Chalet 17**" und
„Apartment Reinigung in **Vendiger**" — letzteres mit Tippfehler, ohne das
zweite „e". Die Systemnamen treffen das nicht.

Gepflegt wird das in den Stammdaten (`houses.dokument_begriffe`), nicht im
Code:

| Haus | Begriffe |
|---|---|
| Wald Chalet | `Chalet 17`, `Trattenbach 299` |
| Venediger Chalet | `Vendiger`, `Venedigersiedlung 316` |

„Chalet 17" ist uebrigens keine Willkuer — die Adresse lautet Trattenbach
299**/17**.

**Nicht aufnehmen:** „Chalet" allein (passt auf beide Haeuser) und
Strassennamen ohne Hausnummer. Uli wohnt Venedigersiedlung 315, das
Ferienhaus ist die 316.

Bei der Zuordnung gewinnt der **laengste** Treffer: „Chalet 17" schlaegt
„Chalet".

### Ortsnamen zaehlen nicht als Einzelbegriff

Beim ersten Lesetest landete **„Gemeinde Neukirchen"** auf Platz 2 einer
Reinigungsrechnung — allein ueber das Wort „neukirchen" aus Ulis
Briefkopf. Das Wort „Gemeinde" steht im Dokument nirgends.

Ursache: `begriffeAus()` in `pdfText.ts` zerlegt Kandidatennamen in
Einzelwoerter ab vier Zeichen. Bei Namen, die einen Ortsnamen enthalten,
entsteht so ein Begriff, der auf jedem eingehenden Dokument trifft.

Behoben ueber `ortsBegriffe()`: Ortsnamen werden aus den Hausadressen
abgeleitet (alles nach dem ersten Komma, ohne Postleitzahlen) und als
Einzelbegriff ausgeschlossen. Der **volle** Name bleibt gueltig — steht
die Gemeinde wirklich als Absender auf einem Dokument, wird sie erkannt.

Abgeleitet werden aktuell: `berlin`, `falkensee`, `münchen`, `neukirchen`.
Keine Handpflege noetig; kommt ein Objekt dazu, waechst die Liste mit.

### Warnungen nur bei fremden Rechnungen

Beim wiederholten Lesen derselben Rechnung erschien fuer jede Position
eine rote Warnung „haengt schon an einer Rechnung" — obwohl sie an genau
der Rechnung hing, die gerade gelesen wurde.

Ein Warnzeichen, das im Normalfall erscheint, entwertet alle Warnungen.
Deshalb wird jetzt verglichen: Haengt die Reinigung an DIESER Rechnung,
ist es eine Feststellung; haengt sie an einer ANDEREN, eine Warnung.

Dafuer muss die Dublettenpruefung **vor** der Zuordnungsschleife laufen —
ohne die Kennung der vorhandenen Rechnung ist der Vergleich nicht
moeglich.

## Beteiligte Dateien

| Datei | Rolle |
|---|---|
| `supabase/SQL/53_reinigungsrechnungen.sql` | Tabelle, Verknuepfung, `dokument_begriffe`, Trigger |
| `supabase/SQL/54_dokumente_reinigungsrechnung.sql` | `documents.cleaning_invoice_id` |
| `supabase/functions/import-boris-invoice/index.ts` | PDF lesen, pruefen, zuordnen — schreibt nichts |
| `src/hooks/useCleaningInvoices.ts` | Anlegen, Auflisten, Status setzen |
| `src/components/Documents/CleaningInvoicePanel.tsx` | Vorschau mit Positionen und Zuordnung |
| `src/components/Documents/DocumentsTab.tsx` | Ablauf, Anlegen beim Ablegen |
| `src/lib/pdfText.ts` | `ortsBegriffe()`, `findeTreffer()` mit Ausschluss |

## Stand und offene Punkte

**Verifiziert am 03.09.2026** in der laufenden App mit Rechnung
002048/2026: gelesen, vier von fuenf Positionen zugeordnet, Rechnung
angelegt (750/900 EUR, `offen`), Beleg und Reinigungen verknuepft.

**Offen:**

- **Der 5.8. bei Venediger** — Rechnung und System weichen ab. Mit Boris
  zu klaeren. Meint er den 9.8., laesst sich die Verknuepfung von Hand
  setzen.
- **Der Bezahlt-Trigger ist ungetestet.** Beim Test standen alle
  Reinigungen bereits auf `paid`, seine Wirkung liess sich nicht
  beobachten. Er greift nur bei `payment_status <> 'paid'`, richtet also
  keinen Schaden an.
- **Das Boris-Portal zeigt keine Rechnungen.** Zugesagt, nicht gebaut. Der
  Hook `useCleaningInvoices(providerId)` liegt bereit.
- **Nicht zugeordnete Positionen** lassen sich nur per SQL nachtraeglich
  verknuepfen; eine Oberflaeche dafuer fehlt.
- **Die Ursache des MwSt-Leseproblems** ist unbekannt. Klaeren liesse es
  sich nur am extrahierten Rohtext, wofuer es bisher keine Moeglichkeit
  gibt.

# Konzept: Wäscheartikel als Stammdaten

> Stand: 04.09.2026 · Anlass: Rechnung RG-0059 vom 31.03.2026 (Wäsche Pinzgau)
> Betrifft: neue Tabellen `laundry_articles`, `laundry_article_prices`;
> mittelfristig `linen_set_definitions.custom_categories`, `ai_linen_settings.prices`,
> `external_article_mapping`, `import-teuni-invoice`, `DocumentsTab.tsx`
> Status: **Konzept. Tabellen definiert, noch nicht angelegt.**

---

## 1. Die Entscheidung

**Teunis Artikel sind unsere Artikel.** Die Unterscheidung zwischen „externen"
und „internen" Artikeln entfällt ersatzlos.

Damit fällt weg:

- die Zuordnung Artikelnummer → internes Feld (beide hartcodierten Maps,
  siehe Abschnitt 2, sowie die Tabelle `external_article_mapping`)
- `ai_linen_settings.prices` als eigene Preisliste — der Preis steht am Artikel
- das Feld `external_artikelnummer` in `LinenItemConfig`
- die interne Schlüsselwelt (`bedding`, `sink_towels`, …) — Schlüssel ist die
  Artikelnummer

Gepflegt werden die Artikel **ausschließlich über das Einlesen der Rechnungen**
in der Dokumentenverwaltung. Ein Artikel, der auf einer Rechnung steht und bei
uns fehlt, wird angelegt. Ein Artikel, dessen Preis abweicht, bekommt einen
neuen Preisstand.

**Nichts davon ist hartcodiert.** Alles läuft über die Datenbank.

---

## 2. Ausgangslage: wo Artikelwissen heute liegt

Geprüft am 04.09.2026 gegen alle 108 Tabellen in
`src/integrations/supabase/types.ts` (generiert, daher belastbarer Spiegel).

**Eine Wäscheartikel-Tabelle gibt es nicht.** Teunis Artikel existieren an drei
Stellen, keine davon eine Stammdatentabelle:

| Ort | Art | Problem |
|---|---|---|
| `ARTIKEL_MAP` in `import-teuni-invoice/index.ts` | hartcodiert | Artikel → Preisfeld, für den **Preis**vergleich |
| `ARTIKEL_ZU_SCHLUESSEL` in `DocumentsTab.tsx` | hartcodiert | dieselbe Sache für den **Mengen**vergleich, **inhaltlich abweichend** |
| `laundry_invoices.positionen` | JSON | Rohdaten, in **zwei** Formaten; nur 2 von 6 Rechnungen haben Positionen |

Die eigenen Artikel liegen ebenfalls nicht relational:

| Was | Wo | Form |
|---|---|---|
| Welche Artikel, Regel, Menge | `linen_set_definitions.custom_categories` | JSON, je Haus |
| Altbestand derselben Sache | feste Spalten `bedding_per_guest` … | Fallback, wenn `custom_categories` leer |
| Unsere Preise | `ai_linen_settings.prices` | JSON, je Haus |
| Lagerbestand | `house_linen_inventory` | relational (`item_key`) |
| Verbrauch je Bestellung | `linen_orders.items` | JSON, dieselben Schlüssel |

`external_article_mapping` ist die einzige echte Tabelle mit Teuni-Nummern,
enthält aber nur `external_artikelnummer` → `internal_item_key`: kein Preis,
keine Bezeichnung, keine Einheit. Sie stammt aus der Anbindung an das externe
Wäsche-Oberpinzgau-System und wird nur noch vom toten REST-Sync gelesen.

> **Repo ≠ Deployment.** `Session-2026-09-02` hält fest, dass `MW4` und `MWR`
> in `ARTIKEL_MAP` ergänzt wurden. Im Repo steht das **nicht** — die Änderung
> wurde offenbar nur im Supabase-Dashboard deployed. Vor jeder Änderung an
> dieser Datei den laufenden Stand abgleichen, sonst überschreibt ein Commit
> aus dem Repo die dortige Korrektur.

---

## 3. Zielmodell

### `laundry_articles` — das Sortiment, ein Datensatz je Artikel

```sql
create table public.laundry_articles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id),
  artikelnummer text not null,
  bezeichnung text,
  einheit text,                     -- 'Stk' | 'kg'
  farbe text,                       -- 'colorful'|'white'|'white_striped'|'grey_striped'|null
  status text not null default 'neu'
    check (status in ('neu','bestaetigt','ignorieren')),
  erstmals_gesehen date,
  zuletzt_gesehen date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Teuni schreibt mal MWHT, mal mwht — Nummer normalisiert eindeutig
create unique index laundry_articles_nr_uniq
  on public.laundry_articles (provider_id, upper(artikelnummer));
```

### `laundry_article_prices` — Preisverlauf

```sql
create table public.laundry_article_prices (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.laundry_articles(id) on delete cascade,
  preis numeric not null,
  gueltig_ab date not null,         -- Rechnungsdatum, das diesen Preis brachte
  gueltig_bis date,                 -- null = aktuell gültig
  invoice_id uuid references public.laundry_invoices(id),
  created_at timestamptz not null default now(),
  unique (article_id, gueltig_ab)
);

create index laundry_article_prices_aktuell
  on public.laundry_article_prices (article_id)
  where gueltig_bis is null;
```

**Warum zwei Tabellen.** Ein Artikel ist ein Ding, ein Preis ist ein Ereignis.
In einer Tabelle müsste entweder der alte Preis überschrieben werden (Historie
weg — genau das, was für die Vorausberechnung gebraucht wird), oder der Artikel
stünde je Preisänderung erneut da, samt Bezeichnung, Einheit und Status.

**Anweisungen einzeln absetzen.** Der SQL-Editor führt markierten Text aus;
mehrzeilige Blöcke sind schon teilweise ausgeführt worden, ohne dass es auffiel
(Lesson aus Session 02.09.2026).

**RLS ist noch offen** — ob und wie die übrigen Tabellen RLS führen, wurde nicht
geprüft. Vor Inbetriebnahme klären.

---

## 4. Was die Tabellen leisten sollen

1. **Artikel aus der Rechnung aufnehmen.** Unbekannte Artikelnummer → neue Zeile
   mit `status='neu'`. Keine automatische Zuordnung zu irgendetwas.
2. **Preise pflegen.** Preis gleich → nichts tun. Preis abweichend → alte
   Preiszeile bekommt `gueltig_bis`, neue Zeile wird angelegt.
3. **Rechnung prüfen.** Preis laut Rechnung gegen den zuletzt gültigen Preis.
   Die Rechenprüfung (Menge × Preis = Zeilensumme, Summe = Gesamtbetrag) gibt es
   in `import-teuni-invoice` bereits und bleibt.
4. **Kosten vorausberechnen.** Über den Preisverlauf. Für Mengen gilt das
   **nicht** — siehe Abschnitt 6.

---

## 5. Umsetzungsreihenfolge

| Schritt | Inhalt | Risiko |
|---|---|---|
| 1 | Tabellen anlegen, aus vorhandenen `laundry_invoices.positionen` befüllen | gering — nichts Bestehendes wird angefasst |
| 2 | `import-teuni-invoice` + `DocumentsTab.tsx` lesen die Artikel aus der Tabelle; beide Maps entfallen | mittel |
| 3 | Wäschesets je Haus aus den Artikeln bilden (`custom_categories` ablösen) | **hoch** |
| 4 | Leser umstellen, `custom_categories` entfernen | hoch |

Schritt 1 und 2 liefern den vollen Nutzen für die Rechnungsprüfung.

**Zu Schritt 1:** `positionen` liegt in zwei Formaten vor — der PDF-Import
schreibt `{artikel, preis, summe}`, der frühere REST-Sync
`{artikelnummer, einzelpreis, gesamtpreis}`. Die Befüllung muss beide lesen.
Die Preise sind nach `rechnungsdatum` aufsteigend zu verarbeiten, sonst wird
`gueltig_bis` falsch.

**Zu Schritt 3 — der Aufwand ist real:** `custom_categories` wird an **15
Dateien** gelesen, darunter die Mengenberechnung
(`generate-booking-linen-order`), die Auto-Bestellung, die Preismaske und die
Auswertung. Die Schlüssel stecken zusätzlich in `linen_orders.items`,
`house_linen_inventory.item_key` und `ai_linen_settings.prices`. Historische
Bestellungen lassen sich **nicht** auf Artikelnummern umschreiben — für sie
gibt es keine. Alte Bestellungen behalten ihre Schlüssel; Auswertungen müssen
beides vertragen.

**Wiederverwendbar:** `TeuniSourcePanel.tsx` und `TeuniSetTemplatesDialog.tsx`
bauen bereits aus Artikeln ein Hausset (`setToCustomCategories()`,
`generateKeyFromLabel()`, Modi „ersetzen"/„zusammenführen"). Ihnen fehlt nur
eine lebende Quelle — heute das externe Projekt über
`useExternalStammdaten` → `external-stammdaten-proxy`. Umhängen auf
`laundry_articles` statt neu bauen.

---

## 6. Offene Punkte

### 6a. Preisliste bei Teuni anfragen (nächster Schritt)

Die Rechnungen liefern nur, was gerade berechnet wurde. Für ein vollständiges
Sortiment fehlt eine **Preisliste mit Artikelnummer, Bezeichnung, Einheit und
Preis**. Damit ließen sich die Tabellen vollständig füllen, statt sie über
Monate aus Rechnungen zusammenzusammeln.

Mit anzufragen:

- Sind bunte und weiße/graue Mietwäsche **getrennte Artikelnummern** oder
  dieselbe? (entscheidend, siehe 6c)
- Wofür steht die Ziffer in `MW3`/`MW4`, `WT2`/`WT3`? Vermutung: Preislisten-
  Generation, nicht Teilezahl — `WT3` = „Waschen Trocknen" ist nicht dreiteilig.
  Aus vier Rechnungen geschlossen, nicht bestätigt.
- Woraus besteht „Paket 5 Tlg" konkret?
- Was ist `MWBT`? Steht in der alten Map, auf keiner vorliegenden Rechnung.

### 6b. Artikelbezeichnungen ändern sich

Dieselbe Sache heißt „Badvorleger" (RG-0082) und „Mietwäsche Badevorleger"
(RG-0117); `mwr` → „Mietwäsche pkt" wurde zu `MW4` → „Mietwäsche Paket 5 Tlg".

Festgelegt: **zuletzt gesehene Bezeichnung gewinnt**, wird bei jedem Import
überschrieben. Der historische Wortlaut bleibt in `laundry_invoices.positionen`
der jeweiligen Rechnung erhalten.

### 6c. Hauszuordnung — Regel bekannt, Datenlage fehlt

Uli am 04.09.2026:

| Was | Farbe | Haus |
|---|---|---|
| Lohnwäsche nach kg (WT3, WTB3) — eigene Wäsche | – | **immer Venediger** |
| Mietwäsche bunt | `colorful` | **immer Wald** |
| Mietwäsche weiß / grau | `white`, `white_striped`, `grey_striped` | **immer Venediger** |

Die erste Zeile ist sofort verwertbar: Kilogramm-Positionen gehören zu
Venediger.

**Die Mietwäsche-Regel greift bisher nicht**, weil die Farbe auf den Rechnungen
nicht steht. RG-0059 (`MW3`, `MWHT`, `MWBVL`, `MWST`), RG-0117 (`MW4`, `MWHT`,
`MWBVL`) und RG-0082 (`mwr`, `mwht`, `mwbvl`) unterscheiden bunt und weiß
nicht.

Bemerkenswert: `LinenItemConfig.external_artikelnummer` ist ausdrücklich als
**farbabhängiges** Mapping gebaut
(`{ "grey_striped": "WA001", "white_striped": "WA005" }`). Im alten externen
System hatte jede Farbe eine eigene Nummer. In Teunis Rechnungen fehlt diese
Unterscheidung.

Deshalb die Spalte `farbe` in `laundry_articles`: gefüllt, sobald eine Nummer
eindeutig einer Farbe gehört; sonst `null` und die Zuordnung bleibt manuell.
**Keine Ableitungslogik in den Tabellen.**

### 6d. Mengen bleiben unberechenbar

„Ein Paket = ein Gast" ist an zwei Rechnungen gescheitert (RG-0082: 9 Pakete /
3 Buchungen, keine Kombination passt; RG-0117: 15 Pakete / 13 erfasste Gäste).
Die naheliegende Erklärung — nachträglich erhöhte Gästezahlen — wurde geprüft
und widerlegt (`guests_changed_at` überall null).

**Preise vorherzusagen wird funktionieren, Mengen noch nicht.** Der Abgleich
zeigt Abweichungen an und blockiert nichts.

### 6e. `external_article_mapping`

Funktional eine Teilmenge der neuen Tabelle, hängt aber noch an
`sync-linen-order-rest` und `useExternalSync`. Ob sie Zeilen enthält, ist
ungeprüft (`select count(*) from external_article_mapping;`). Falls dort noch
Teuni-Nummern stehen, sind das Startdaten. Abräumen gehört zum Aufräumen des
alten Provider-Wegs, nicht hierher.

# Einfügetexte für docs/CODE-INDEX.md

Drei Blöcke aus zwei Themen. Wörtlich einfügen, sonst nichts ändern.

---

# THEMA A — Reinigungskosten (19.08.2026)

## A1 — neuer Abschnitt „9c"

**Einfügen direkt VOR der Zeile `## 9b. Wäschebestellung: VIER Anlegewege`**

```markdown
## 9c. Reinigungskosten: Berechnung, Abrechnungsart, MwSt — 19.08.2026

**Vollständig: `docs/Kosten-Reinigung-Berechnung.md` — bei allem lesen, was
Beträge, Stundensätze, Pauschalen oder MwSt der Reinigung berührt.**

**Die Formel liegt an EINER Stelle: `src/lib/cleaningCost.ts`.**

```
billing_mode = 'flat'    →  cleaning_cost = flat_rate
billing_mode = 'hourly'  →  cleaning_cost = hourly_rate × cleaning_hours
```

`service_tasks.cleaning_cost` ist **NETTO**. `cleaning_vat_percentage` friert
den Steuersatz auf dem Auftrag ein. **Brutto wird abgeleitet, nie gespeichert.**

Beträge entstehen an drei Stellen — keiner weiteren:

| Datei | Wann |
|---|---|
| `Cleaning/CreateCleaningTaskDialog.tsx` | Reinigung von Hand anlegen |
| `Cleaning/EditCleaningTaskDialog.tsx` | Reinigung bearbeiten |
| `supabase/functions/create-cleaning-task-for-booking/index.ts` | Automatik (Status `draft`) |

Nachträgliche Korrektur bestehender Beträge:
`ServicePortal/ProviderBillingDialog.tsx` („Einträge bearbeiten").

> ⚠️ **Doppelgänger:** Die Edge Function trägt eine bewusst identische Kopie
> der Formel — Deno kann `src/lib/` nicht importieren. **Wer die Formel
> ändert, muss BEIDE ändern.** Die Edge Function braucht ein eigenes Deploy.

**Kein Ersatzwert.** Fehlt der zur Abrechnungsart passende Satz, entsteht kein
Betrag und kein Auftrag, sondern eine Fehlermeldung. Der frühere stille
Rückfall `provider.hourly_rate || 50` ist entfernt — er war toter Code, bis
Boris auf Pauschale umgestellt wurde und `hourly_rate` dadurch NULL war.

**Anlegewege OHNE Kosten (unverändert offen):** `useBookingInquiries.ts`,
`chat-assistant` (`accept_booking_inquiry`) und `AddStandaloneCleaningDialog.tsx`
in beiden Portalen legen Reinigungen ohne `provider_id` und ohne Kosten an.

**Nicht verwechseln:** `cleaning_fee_per_stay` (80 €) ist die Gebühr, die der
**Gast** zahlt (`usePricingConfig.ts`). Mit den Dienstleisterkosten im Code
nicht verknüpft.

SQL: `supabase/SQL/50_reinigungskosten_abrechnungsart.sql`
```

## A2 — Ergänzung in Abschnitt 11 („Provider")

**Einfügen direkt NACH der Zeile
`Hooks: useProviderMessages, useProviderMessageNotifications, useLaundryInvoices.`**

```markdown
### Kosten & Abrechnungsart (19.08.2026)

`ProviderManagementDialog.tsx` → Bearbeiten enthält bei Service-Typ „Reinigung"
den Block **Abrechnungsart** (Pro Stunde | Pauschale pro Reinigung), das dazu
passende Betragsfeld (netto) und den **MwSt-Satz**. Alle drei sind echte
Pflichtfelder — `handleSubmit` prüft und bricht ab. Der jeweils nicht aktive
Satz wird beim Speichern auf NULL gesetzt.

`ProviderBillingDialog.tsx` zeigt **Netto · MwSt · Brutto** mit Brutto-Summen.
Über den blauen Knopf **„Einträge bearbeiten"** werden Stunden, Netto und
MwSt-Satz je Zeile frei überschreibbar; „aus Satz" bzw. „Alle aus
Abrechnungsart füllen" übernimmt die hinterlegte Definition. Der **Bezahlstatus
lässt sich per Klick auf das Badge** umschalten.

> Die Query filtert hart auf `status = 'completed'` — Reinigungen in anderen
> Status erscheinen in der Abrechnung **nicht**.

**Zahlenfelder:** alle tragen `onWheel={(e) => (e.target as HTMLElement).blur()}`.
Ohne das verstellt Scrollen mit dem Zeiger über dem Feld den Wert lautlos
(aus 150,00 wurde so einmal 149,98). **Bei jedem neuen Zahlenfeld mitgeben.**

**Die Portale rechnen NICHTS.** In `amela-clean-hub-selfhosted` und
`boris-clean-hub-selfhosted` kommt `cleaning_cost` nur in `types.ts` vor. Das
dortige `hourly_rate` (`StaffForm.tsx`, `PutzkraeftePage.tsx`) ist
`cleaning_staff.hourly_rate` — der Lohn ihrer eigenen Putzkräfte, nie
multipliziert.

Details: `docs/Kosten-Reinigung-Berechnung.md`
```

---

# THEMA B — Dokumentenverwaltung (20.08.2026)

## B1 — neuer Abschnitt „12"

**Einfügen ans Ende der Datei, als neuer Hauptabschnitt.**

```markdown
## 12. Dokumentenverwaltung mit OneDrive — NEU 20.08.2026

**Vollständig: `docs/Dokumentenverwaltung-OneDrive.md`. Vor jeder Änderung an
Dokumenten, Ablageorten oder der OneDrive-Anbindung lesen.**

**Nicht verwechseln mit `docs/Konzept-OneDrive-Belegarchiv.md`** — das
beschreibt die Gegenrichtung (Scannen, Gemini-Auslesung) und ist NICHT
umgesetzt.

### Grundsätze

- Ein Dokument = Datei + Metadaten + **EIN** Bezug. Inhalte werden NICHT
  ausgelesen und NICHT in Positionen zerlegt.
- Die Datei bleibt in OneDrive. Keine Zweitablage in Supabase Storage.
- **Dokumenttyp und Zuordnung sind unabhängig frei wählbar.** Der Typ
  erzwingt nichts — `document_types.link_target` ist VERALTET.
- **Der Ablageort wird festgelegt, nicht abgeleitet.**
  `document_types.folder_rule` ist VERALTET. Uli wählt den Ordner; die Wahl
  wird je Kombination aus Objekt und Dokumenttyp in `document_locations`
  gemerkt.
- Struktur in OneDrive: `DokumentManagement / <Objekt> / <Dokumenttyp>`

### Tabellen

| Tabelle | Zweck |
|---|---|
| `integration_tokens` | Microsoft-Refresh-Token. **RLS ohne Policy** — nur service_role, Absicht |
| `document_types` | Name + `folder_name` (Unterordner). Deaktivieren statt löschen |
| `document_vendors` | Rechnungsabsender ohne Systemobjekt (Gemeinde, Energieversorger) |
| `documents` | Metadaten + `onedrive_item_id` (UNIQUE) + genau ein Bezug |
| `document_locations` | festgelegter Ordner je `(entity_type, entity_id, document_type_id)` |

Bezugsspalten an `documents`: `house_id`, `booking_id`, `service_task_id`,
`linen_order_id`, `provider_id`, `vendor_id` — höchstens eine gesetzt.

Bei **Buchung, Reinigung und Wäschelieferung** hängt der Ablageort am
zugehörigen **Haus** (`useEntities` → `locationType` / `locationId`). Eine
einzelne Reinigung bekommt keinen eigenen Ordner.

SQL: `supabase/SQL/51_dokumentenverwaltung.sql` und `52_dokumente_ablageorte.sql`

### Dateien

| Datei | Aufgabe |
|---|---|
| `supabase/functions/_shared/onedrive.ts` | Token, Graph-Aufrufe |
| `supabase/functions/onedrive-oauth/index.ts` | einmalige Anmeldung |
| `supabase/functions/onedrive-api/index.ts` | alle Dateioperationen |
| `src/hooks/useDocuments.ts` | alle Zugriffe |
| `src/components/Documents/DocumentsTab.tsx` | Übersicht, Suche, Ablage |
| `src/components/Documents/DocumentSettings.tsx` | Typen, Objekte, Ablageorte |

> `_shared/onedrive.ts` wird von BEIDEN Functions eingebunden — nach einer
> Änderung dort beide neu deployen.

### Drei Fallen (jede hat zugeschlagen)

**1. `redirect_uri` NIEMALS aus `req.url` ableiten.** Supabase reicht die
Anfrage intern weiter; `${url.origin}${url.pathname}` ergibt
`http://…supabase.co/onedrive-oauth` statt
`https://…supabase.co/functions/v1/onedrive-oauth`. Fest aus `SUPABASE_URL`
bilden. Microsoft meldet ein irreführendes `invalid_request`.

**2. `supabase.rpc()` ist ein Thenable, KEIN Promise.** `.catch()` existiert
dort nicht und wirft „catch is not a function". `try/catch` verwenden. Der
Fehler saß im Refresh-Pfad und zeigte sich erst eine Stunde nach der Anmeldung.

**3. `itemInfo` liefert bei einem ORDNER den Pfad des ELTERNordners.** Den
Pfad aus dem Klickweg im Baum aufbauen, nicht aus dieser Antwort.

**Nützlich:** Supabase bildet den Secret-DIGEST als reines SHA-256 — damit
lässt sich per `supabase secrets list` prüfen, ob ein Geheimnis korrekt
angekommen ist.

### Betrieb

Microsoft-App „Steinbock Dokumente", Client-ID
`32a496ba-01d8-4e71-8072-9e85d07aca87`, Kontotyp „nur persönliche Konten",
verbunden mit `uli.berresheim@hotmail.de`.
Secrets: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`.

> ⚠️ **Das Clientgeheimnis läuft am 19.08.2028 ab.** Danach steht die gesamte
> Anbindung still, ohne erkennbare Ursache. Kalendereintrag auf Juli 2028.
```

## B2 — Ergänzung in Abschnitt 1 („Einstiegspunkte")

**Einfügen bei der Beschreibung von `src/pages/OriginalDashboard.tsx`**

```markdown
Tab „Dokumente" (📄) zwischen „Preise" und „Einstellungen": Lazy-Import von
`@/components/Documents/DocumentsTab`, Eintrag in der `tabs`-Liste, Fall in
`renderTabContent`. Zwölf Tabs insgesamt.
```


---

# THEMA C — Max und die Dokumente (21.08.2026)

## C1 — Ergänzung in Abschnitt 12 (Dokumentenverwaltung)

**Einfügen ans Ende des Abschnitts 12, VOR dem Betriebs-Block.**

```markdown
### Max' Zugriff (21.08.2026)

**Vollständig: `docs/Max-und-Dokumente.md`.**

Max liest **nur die Datenbank, nie OneDrive**. `documents` trägt Name, Typ,
Bezug, Pfad und `onedrive_web_url` — für Suchen und Verweisen reicht das.

| Werkzeug | Zweck |
|---|---|
| `search_documents` | Suche nach Objekt, Typ, Zeitraum, Dateiname. `objekt` ist ein NAME; das Werkzeug löst ihn in service_providers / houses / document_vendors selbst auf und meldet Mehrdeutigkeit, statt zu raten. |
| `dokumenteAnhaengen()` | Hilfsfunktion: hängt Dokumente an die Treffer von `search_bookings`, `search_cleaning_tasks` und `search_linen_orders`. |

> ⚠️ **Doppelgänger:** Die Anreicherung steht EINMAL in `dokumenteAnhaengen()`
> und wird DREIMAL aufgerufen. Ein viertes Suchwerkzeug ruft dieselbe Funktion
> auf — nicht kopieren.

`buildEntityLinks` erzeugt Links vom Typ **`document`** mit zusätzlichem Feld
`url`. In `ChatMessage.tsx` ist das der einzige Typ, der KEINEN Tabwechsel
auslöst, sondern `window.open(url, '_blank', 'noopener,noreferrer')` — die
Datei liegt nicht in der App.

**Max kennt den INHALT nicht.** Das steht ausdrücklich in der
Werkzeugbeschreibung, damit er aus `Boris_Rechnung_August.pdf` keine Summe
herleitet. Stufe 3 (Inhalt lesen per Gemini) ist entworfen, aber NICHT
gebaut — siehe `docs/Vorschlag-Max-Dokumente.md`.

`search_documents` ist rein lesend und braucht daher KEINEN Eintrag in
`max_ablaeufe` (siehe dortige `systempruefung`).
```

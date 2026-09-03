# Einfuegetexte — stille Ausstiege im Rechnungspfad (03.09.2026)

Arbeitsanweisung, kein Dauerdokument. Nach dem Einfuegen loeschbar.

---

## Einfuegung 1 — `docs/ARBEITSWEISE-CLAUDE-LESSONS.md`

**Wohin:** ans Ende der Datei, als neuer Abschnitt 11.

```markdown
## 11. Lessons aus der Sitzung 03.09.2026 (Waescherechnung ueber die Dokumentenablage)

### 11.1 Ein Ausstieg ohne Meldung ist derselbe Fehler wie eine falsche Erfolgsmeldung

Rechnung RG-0117 lag korrekt in OneDrive und in `documents`, fehlte aber in
`laundry_invoices`. Weder die Hausverwaltung noch das Teuni-Portal zeigten sie —
beide lesen dieselbe Tabelle. Der Beleg war ueber den Weg „Datei liegt schon in
OneDrive, nur verknuepfen" abgelegt worden. Dieser Zweig ruft
`rechnungNachtragen()` gar nicht auf; der Nutzer sah „Verknuepft" und hielt den
Vorgang fuer vollstaendig.

Im zweiten Zweig (Datei vom PC) gab es denselben Effekt aus anderem Grund:
`rechnungNachtragen()` begann mit
`if (!rechnungAnlegen || !rechnung || rechnung.bereits_erfasst) return;` —
drei verschiedene Gruende, ein wortloses `return`. Dazu ein `catch {}` mit dem
Kommentar „stillschweigend", der auch echte Fehler der Edge Function verschluckte.

**Lesson 6.5 sagt:** Eine Erfolgsmeldung darf nie erscheinen, wenn ein
Teilschritt fehlgeschlagen ist. Der Fall hier zeigt die Erweiterung: **Auch ein
bewusst uebersprungener Schritt muss gemeldet werden**, wenn der Nutzer sein
Ergebnis erwartet. „Nicht ausgefuehrt" und „fehlgeschlagen" sehen fuer ihn
gleich aus — er sieht in beiden Faellen nur, dass etwas fehlt, und zwar erst
Wochen spaeter.

**Regel:** Ein `return` ohne Begruendung in einem Pfad, den der Nutzer
angestossen hat, ist ein Fehler. Entweder die Funktion gibt den Grund zurueck
und der Aufrufer zeigt ihn, oder der Fall gehoert gar nicht uebersprungen.
Ein Kommentar im Code („stillschweigend, das ist in Ordnung") ist keine
Meldung an den Menschen.

**Behoben am 03.09.2026** in `DocumentsTab.tsx`: `rechnungNachtragen()` gibt
`string | null` zurueck (Grund oder Erfolg), der Aufrufer unterscheidet die
Toasts, und der Leseschritt zeigt einen sichtbaren Hinweis, wenn bei einem
Waeschedienstleister keine Rechnungsdaten herauskamen.

### 11.2 Zwei Namen fuer dasselbe, zwei Namen fuer Verschiedenes

Zwei Verwechslungen an einem Tag, beide aus derselben Wurzel:

1. **`package.json`-Version vs. `public/version.json`** — gleicher Begriff
   „Version", voellig verschiedene Mechanismen (Footer-Anzeige vs.
   PWA-Cache-Busting). Der veraltete Stand der einen Datei im Repo fuehrte
   beinahe dazu, einen funktionierenden Mechanismus ein zweites Mal zu bauen.
   Siehe `docs/Versionierung-und-Auto-Bump.md`.
2. **Spaltennamen geraten statt gelesen** — `dateiname` statt `file_name`,
   `inhalt` statt `meaning`. Beide Male wurde ein deutscher Name angenommen,
   weil Oberflaeche und Doku deutsch sind. Das Schema folgt aber
   CODING-GUIDE B1: **UI deutsch, Bezeichner englisch**.

**Verschaerfend:** `src/integrations/supabase/types.ts` kennt acht Tabellen
nicht — `documents`, `document_types`, `document_vendors`, `document_locations`,
`integration_tokens`, `assistant_knowledge`, `max_ablaeufe`, `max_actions`.
Sie sind seit ihrer Anlage nie in die generierte Datei gewandert. Deshalb die
`as any`-Casts im Dokumenten-Code, deshalb keine Compiler-Warnung bei falschen
Feldnamen.

**Regel:** Fuer diese acht Tabellen ist `supabase/SQL/` die einzige belastbare
Quelle — dort steht jede `CREATE TABLE` vollstaendig. Ein `grep` dauert eine
Sekunde. Raten dauert laenger, weil die Abfrage danach fehlschlaegt.
```

---

## Einfuegung 2 — `docs/CODE-INDEX.md`, Abschnitt 11

**Wohin:** Der Unterabschnitt „PDF-Import von Teuni-Rechnungen (24.07.2026)"
beschreibt `ImportInvoicePdfDialog.tsx` und den Knopf „PDF einlesen" als
aktiven Weg. **Beides existiert nicht mehr im Repo** (verifiziert 03.09.2026:
Datei geloescht, kein einziger Verweis). Ebenso ist in der Aufzaehlung der
Dateien am Anfang von Abschnitt 11 `ImportInvoicePdfDialog.tsx` zu streichen.

**Vor den bestehenden Unterabschnitt setzen:**

```markdown
### Rechnungsimport laeuft ueber die Dokumentenablage (Stand 03.09.2026)

**Der Knopf „PDF einlesen" im Provider-Tab existiert nicht mehr.**
`ImportInvoicePdfDialog.tsx` wurde geloescht; der nachfolgende Abschnitt vom
24.07.2026 beschreibt einen entfernten Weg und bleibt nur als Historie stehen.

Der aktive Weg ist die **Dokumentenablage** (`Documents/DocumentsTab.tsx`):
Datei vom PC waehlen → „Dokument lesen" → Edge Function `import-teuni-invoice`
liefert Kopfdaten, Positionen und das Flag `bereits_erfasst` → Vorschau mit
Positionen und vorausgewaehlten Wäschebestellungen → nach Freigabe durch den
Menschen entsteht in einem Zug:

| Tabelle | was geschrieben wird |
|---|---|
| `laundry_invoices` | die Rechnung, `status = 'offen'` |
| `documents` | der Beleg, `laundry_invoice_id` zeigt auf die Rechnung |
| `linen_orders` | `laundry_invoice_id` bei den angehakten Bestellungen |

Das Prinzip aus dem Abschnitt unten gilt unveraendert: **Die Edge Function
schreibt nichts.** Sie liest und schlaegt vor; angelegt wird erst nach
Freigabe.

**Bekannte Luecke:** Der Leseschritt gibt es nur fuer Dateien vom PC. Liegt die
Datei bereits in OneDrive und wird nur verknuepft, fehlt der Knopf — die
`onedrive-api` hat keine Aktion, die Dateiinhalt liefert (nur `itemInfo` mit
Metadaten). In diesem Weg entsteht **keine** Rechnung. Seit 03.09.2026 ist das
wenigstens nicht mehr stumm (siehe Lesson 11.1), behoben ist es nicht.

**Zweite bekannte Luecke:** Ist eine Rechnung schon erfasst (`bereits_erfasst`),
wird der neue Beleg **nicht** mit der vorhandenen Rechnung verknuepft —
`laundry_invoice_id` bleibt null. Dafuer muesste `import-teuni-invoice` die
Kennung der gefundenen Rechnung mitliefern; derzeit gibt sie nur ein Flag und
einen Infotext zurueck.
```

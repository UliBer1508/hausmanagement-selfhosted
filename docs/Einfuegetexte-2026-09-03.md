# Einfuegetexte — Sitzung 03.09.2026

Arbeitsanweisung, kein Dauerdokument. Nach dem Einfuegen loeschbar.

Diese Sitzung hat drei Themen hinterlassen, die in bestehende Dokumente
gehoeren. Die beiden eigenstaendigen Dateien
(`Versionierung-und-Auto-Bump.md`, `Reinigungsrechnungen-Boris.md`) sind
separat geliefert.

---

## 1 — `AGENTS.md`, Abschnitt „Abschluss jeder Änderung"

Als zusaetzlichen Punkt am Ende:

```markdown
- **Versionsnummer:** wird automatisch hochgezählt — nicht von Hand in
  `package.json` ändern. Steuerung über die Commit-Message: `[minor]` für
  ein abgeschlossenes Feature, `[major]` für einen großen Meilenstein,
  sonst Patch. `[skip version]` unterdrückt den Bump (Doku-Commits).
  Hintergrund: `docs/Versionierung-und-Auto-Bump.md`.
```

## 2 — `AGENTS.md`, Abschnitt „Ausführliche Referenzen im Repo"

Zwei Punkte ans Ende der Liste:

```markdown
- `docs/Versionierung-und-Auto-Bump.md` — die ZWEI Versionsnummern des
  Projekts (`package.json` = Footer-Anzeige, `public/version.json` =
  PWA-Cache-Busting). Lesen, bevor man einen der beiden Mechanismen
  anfasst oder für kaputt hält.
- `docs/Reinigungsrechnungen-Boris.md` — Rechnungen von
  Reinigungsdienstleistern: eigene Tabelle `cleaning_invoices`, eigene
  Edge Function, Zuordnung über Datum + Haus. Erklärt auch, warum es
  ZWEI Rechnungstabellen gibt und warum der PDF-Leser doppelt im Projekt
  liegt.
```

## 3 — `docs/Steinbock-Chalets-Gesamtdokumentation-MASTER.md`, „Deploy-Wege"

Nach der Zeile zum Frontend-Deploy:

```markdown
- **Versionierung:** zwei getrennte Nummern, nicht verwechseln.
  `package.json` → Footer-Anzeige, wird von `.github/workflows/version-bump.yml`
  bei jedem Push auf `main` hochgezählt (`[minor]`/`[major]`/`[skip version]`
  in der Commit-Message steuern den Typ). `public/version.json` →
  PWA-Cache-Busting, wird vom `versionStampPlugin` in `vite.config.ts` bei
  jedem Build erzeugt; der Stand im Repo ist ein veraltetes Build-Artefakt
  und bewusst nicht gepflegt. Details: `docs/Versionierung-und-Auto-Bump.md`.
```

## 4 — `docs/CODE-INDEX.md`, Abschnitt 11

**Zu korrigieren:** Der Unterabschnitt „PDF-Import von Teuni-Rechnungen
(24.07.2026)" beschreibt `ImportInvoicePdfDialog.tsx` und den Knopf „PDF
einlesen" als aktiven Weg. **Beides existiert nicht mehr** (verifiziert
03.09.2026: Datei geloescht, kein Verweis im Code). Auch aus der
Dateiliste am Anfang von Abschnitt 11 streichen.

**Davor einfuegen:**

```markdown
### Rechnungsimport läuft über die Dokumentenablage (Stand 03.09.2026)

**Der Knopf „PDF einlesen" im Provider-Tab existiert nicht mehr.**
`ImportInvoicePdfDialog.tsx` wurde gelöscht; der Abschnitt vom 24.07.2026
beschreibt einen entfernten Weg und bleibt nur als Historie stehen.

Aktiv ist die **Dokumentenablage** (`Documents/DocumentsTab.tsx`). Welcher
Pfad läuft, entscheidet der `service_type` des erkannten Absenders:

| service_type | Edge Function | Ziel-Tabelle | Verknüpft mit |
|---|---|---|---|
| `laundry` (Teuni) | `import-teuni-invoice` | `laundry_invoices` | `linen_orders` |
| `cleaning` (Boris) | `import-boris-invoice` | `cleaning_invoices` | `service_tasks` |

Beide gilt: **Die Edge Function schreibt nichts.** Sie liest und schlägt
vor; angelegt wird nach Freigabe durch den Menschen.

Der Unterschied liegt in der Zuordnung: Teunis Sammelrechnung nennt keinen
Bezug zur einzelnen Lieferung, dort wählt der Mensch aus offenen
Bestellungen. Boris' Rechnung schlüsselt auf — jede Zeile nennt Datum und
Objekt, die Zuordnung ist bestimmbar und läuft automatisch.

Details zum Reinigungspfad: `docs/Reinigungsrechnungen-Boris.md`.

**Bekannte Lücke (beide Pfade):** Der Leseschritt gibt es nur für Dateien
vom PC. Liegt die Datei bereits in OneDrive und wird nur verknüpft, fehlt
der Knopf — `onedrive-api` hat keine Aktion, die Dateiinhalt liefert (nur
`itemInfo` mit Metadaten). In diesem Weg entsteht **keine** Rechnung. Seit
03.09.2026 ist das wenigstens nicht mehr stumm, behoben ist es nicht.

**Zweite Lücke (nur Teuni):** Ist eine Rechnung schon erfasst, wird der
neue Beleg nicht mit ihr verknüpft — `laundry_invoice_id` bleibt null.
`import-teuni-invoice` müsste dafür die Kennung der gefundenen Rechnung
mitliefern; sie gibt nur ein Flag zurück. Der Boris-Pfad liefert sie
bereits (`erfasst_id`).
```

## 5 — `docs/ARBEITSWEISE-CLAUDE-LESSONS.md`

Als neuer Abschnitt 11 ans Ende:

```markdown
## 11. Lessons aus der Sitzung 03.09.2026

### 11.1 Ein Ausstieg ohne Meldung ist derselbe Fehler wie eine falsche Erfolgsmeldung

Rechnung RG-0117 lag korrekt in OneDrive und in `documents`, fehlte aber
in `laundry_invoices`. Weder Hausverwaltung noch Teuni-Portal zeigten sie —
beide lesen dieselbe Tabelle. Der Beleg war über den Weg „Datei liegt
schon in OneDrive, nur verknüpfen" abgelegt worden. Dieser Zweig ruft
`rechnungNachtragen()` gar nicht auf; der Nutzer sah „Verknüpft" und hielt
den Vorgang für vollständig.

Im PC-Zweig gab es denselben Effekt aus anderem Grund:
`if (!rechnungAnlegen || !rechnung || rechnung.bereits_erfasst) return;` —
drei Gründe, ein wortloses `return`. Dazu ein `catch {}` mit dem Kommentar
„stillschweigend", der auch echte Fehler verschluckte.

**Lesson 6.5 sagt:** Eine Erfolgsmeldung darf nie erscheinen, wenn ein
Teilschritt fehlgeschlagen ist. Der Fall zeigt die Erweiterung: **Auch ein
bewusst übersprungener Schritt muss gemeldet werden.** „Nicht ausgeführt"
und „fehlgeschlagen" sehen für den Nutzer gleich aus — er merkt in beiden
Fällen nur, dass etwas fehlt, und zwar Wochen später.

**Regel:** Ein `return` ohne Begründung in einem Pfad, den der Nutzer
angestoßen hat, ist ein Fehler. Entweder die Funktion gibt den Grund
zurück und der Aufrufer zeigt ihn, oder der Fall gehört nicht
übersprungen. Ein Kommentar im Code ist keine Meldung an den Menschen.

### 11.2 Eine Warnung im Normalfall entwertet alle Warnungen

Beim wiederholten Einlesen derselben Reinigungsrechnung erschien für jede
Position eine rote Warnung „hängt schon an einer Rechnung" — obwohl sie an
genau der Rechnung hing, die gerade gelesen wurde.

Der Code prüfte nur, OB eine Verknüpfung existiert, nicht MIT WELCHER
Rechnung. Behoben durch Vergleich; dafür musste die Duplikatsprüfung vor
die Zuordnungsschleife wandern.

**Regel:** Vor jeder Warnung prüfen, ob sie auch im erwarteten Normalfall
feuert. Wenn ja, ist es keine Warnung, sondern Rauschen — und Rauschen
sorgt dafür, dass die echten Warnungen mitüberlesen werden.

### 11.3 Zwei Namen für dasselbe, ein Name für Verschiedenes

Drei Verwechslungen an einem Tag:

1. **`package.json`-Version vs. `public/version.json`** — gleicher Begriff
   „Version", völlig verschiedene Mechanismen. Der veraltete Stand der
   einen Datei im Repo führte beinahe dazu, einen funktionierenden
   Mechanismus ein zweites Mal zu bauen. Siehe
   `docs/Versionierung-und-Auto-Bump.md`.
2. **Spaltennamen geraten statt gelesen** — `dateiname` statt `file_name`,
   `inhalt` statt `meaning`. Beide Male wurde ein deutscher Name
   angenommen, weil Oberfläche und Doku deutsch sind. Das Schema folgt
   aber CODING-GUIDE B1: **UI deutsch, Bezeichner englisch.**
3. **„Gemeinde Neukirchen" auf einer Reinigungsrechnung** — das
   Einzelwort „neukirchen" aus dem Kandidatennamen traf Ulis Briefkopf.
   Der Ortsname ist als Unterscheidungsmerkmal wertlos; `adressBegriffe()`
   wusste das seit dem 23.08.2026 und ließ Orte aus, `begriffeAus()` nicht.

**Verschärfend zu Punkt 2:** `src/integrations/supabase/types.ts` kennt
acht Tabellen nicht — `documents`, `document_types`, `document_vendors`,
`document_locations`, `integration_tokens`, `assistant_knowledge`,
`max_ablaeufe`, `max_actions`. Deshalb die `as any`-Casts im
Dokumenten-Code, deshalb keine Compiler-Warnung bei falschen Feldnamen.

**Regel:** Für diese acht Tabellen ist `supabase/SQL/` die einzige
belastbare Quelle — dort steht jede `CREATE TABLE` vollständig. Ein `grep`
dauert eine Sekunde; Raten dauert länger, weil die Abfrage danach
fehlschlägt.

### 11.4 Ein veraltetes Build-Artefakt im Repo ist kein Fehler

Die Frage „warum haben wir keine neue Versionsnummer?" führte zunächst zur
Diagnose, der PWA-Update-Mechanismus sei kaputt: `public/version.json`
trug im Repo einen Stand vom 22.06.2026, gesetzt von `lovable-dev[bot]`.

**Tatsächlich** enthält `vite.config.ts` seit jeher einen
`versionStampPlugin`, der die Datei bei jedem Build neu schreibt. Der
Stand im Repo ist irrelevant — Build-Artefakte werden nicht
zurückcommittet. Der Mechanismus funktionierte die ganze Zeit. Der
eigentliche Punkt war eine völlig andere Nummer.

**Regel:** Der Zustand einer generierten Datei im Repository beweist
nichts über den Zustand im Deployment. Prüfen heißt, die Datei **live**
unter ihrer URL abzurufen. Vor der Diagnose „X ist kaputt" muss die
erzeugende Stelle gelesen worden sein, nicht nur das Ergebnis.
```

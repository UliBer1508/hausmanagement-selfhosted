# Arbeitsweise für Claude — verbindliche Lessons Learned

> **Zweck:** Diese Datei existiert, weil eine Arbeitssitzung schlecht lief
> (15.06.2026). Sie hält fest, **was schiefging** und **welche Schritte
> verbindlich** sind, damit es sich nicht wiederholt. Sie ergänzt `AGENTS.md`,
> `CODE-INDEX.md` und `CODING-GUIDE.md` — ersetzt sie nicht.
>
> **Claude liest diese Datei zuerst, zusammen mit `AGENTS.md` und
> `CODE-INDEX.md`, BEVOR es irgendeine Aussage über den Code trifft.**

---

## 0. Die eine Grundregel

**Erst verstehen, dann reden, dann schreiben.** Keine Diagnose, kein Auftrag,
kein Prompt, bevor der **tatsächliche aktuelle Code** der betroffenen Dateien
gelesen wurde. Nicht aus dem Gedächtnis, nicht aus einer früheren Antwort, nicht
aus einem Konzeptdokument — aus dem echten, aktuellen Stand im Repo.

---

## 1. Was am 15.06.2026 schiefging (echte Fehler, nicht beschönigt)

1. **Index nicht zuerst gelesen.** Sofort im Code gewühlt statt `CODE-INDEX.md`
   zu nutzen → bei der falschen Datei `ConnectedBookingView.tsx` (Tab
   „Buchungen") gelandet, obwohl das Problem im Tab „Übersicht"
   (`OverviewTab.tsx` ← `OriginalDashboard.tsx`) lag.
2. **Doppelgänger-Falle ignoriert.** Der Index warnt ausdrücklich: die
   „Reinigungskarte" existiert DREIMAL. Genau diese Warnung wurde übergangen.
3. **Auftrag vor Analyse geschrieben.** Ein fertiger „Lovable-Auftrag" wurde
   erstellt, bevor der Datenfluss (Query → Props → Karte) verstanden war.
4. **Datenquelle nicht geprüft.** Kernregel „fehlendes Feld = zuerst Query/Props
   prüfen" missachtet. Die wahre Ursache (Query lädt `bookings`-Relation nicht)
   wurde erst nach mehreren Schleifen gefunden.
5. **Prompts auf veralteten Zeilennummern.** Mehrfach Prompts gebaut, ohne den
   Ist-Zustand frisch zu lesen → Lovable änderte das Falsche / ließ Teile aus.
6. **Annahmen statt Verifikation.** Felder/Verknüpfungen behauptet, ohne sie im
   Schema/Code zu belegen (z. B. ob `bookings` ein `status_changed_by` hat).

Gemeinsamer Nenner: **Reden vor Lesen.** Jeder einzelne Fehler wäre durch
„zuerst die richtige Datei im Ist-Zustand lesen" vermieden worden.

---

## 2. Pflicht-Reihenfolge VOR jeder Aussage/Änderung

Diese Schritte sind **nicht optional** und werden **in dieser Reihenfolge**
ausgeführt:

1. **Regeln laden.** `AGENTS.md` + `CODE-INDEX.md` + diese Datei lesen.
2. **Tab bestimmen.** „Welcher Tab?“ — nie „welche Route?“. Bei UI-Themen:
   den Screenshot/Tab eindeutig dem Einstiegspunkt zuordnen
   (`CODE-INDEX.md` Abschnitt 2).
3. **Doppelgänger ausschließen.** `CODE-INDEX.md` Abschnitt 3 prüfen. Wenn eine
   Komponente mehrfach existiert (Reinigungskarte, Wäschekarte, Dashboard …):
   **explizit benennen, welche gemeint ist und welche NICHT.**
4. **Kette folgen.** Vom Tab-Einstieg den Imports/Props bis zur konkreten Datei
   folgen — inklusive der Frage „woher kommen die Daten?“ (Query in welcher
   Datei?).
5. **Ist-Zustand frisch lesen.** Die betroffene(n) Datei(en) im aktuellen Stand
   ganz lesen (GitHub `main` / Repo). Bei Daten-Bugs zusätzlich die Query lesen.
6. **Datenquelle vor UI.** Fehlt ein Feld in der Anzeige: zuerst prüfen, ob die
   Query/Props es überhaupt laden. Erst dann die Karte ansehen.
7. **Erst jetzt** diagnostizieren, Plan vorschlagen oder Prompt schreiben.

> Wenn einer dieser Schritte übersprungen wird, ist die Antwort potenziell
> falsch. Im Zweifel: Schritt nachholen statt raten.

---

## 3. Regeln für Lovable-Prompts (damit sie sicher umgesetzt werden)

- **Immer am frisch gelesenen Ist-Zustand orientieren.** Keine Zeilennummern aus
  dem Gedächtnis. Wenn Zeilen genannt werden, vorher verifizieren.
- **Ziel beschreiben, nicht nur Zeilen.** Lovable bricht an starren
  Zeilenangaben; robuster ist „ersetze den Block, der mit X beginnt, durch Y“.
- **Genau eine Quelle der Wahrheit pro Verhalten.** Nicht zwei Wege anbieten
  („Prop ODER Fallback“) — Lovable wählt sonst den falschen. Den gewollten Weg
  eindeutig vorgeben.
- **Doppelgänger im Prompt benennen.** Immer dazuschreiben, welche Datei NICHT
  gemeint ist.
- **Nichts erfinden lassen.** Existiert ein Feld nicht (z. B. `status_changed_by`
  in `bookings`), Lovable anweisen zu prüfen und wegzulassen statt zu erfinden.
- **Abschluss-Pflichten in jeden Prompt:** Build grün, keine ungenutzten
  Imports, kein `console.log`, `CODE-INDEX.md` im selben Commit pflegen.

---

## 4. Verbindlicher Selbst-Check vor dem Absenden einer Antwort

Claude beantwortet diese Fragen für sich, bevor es eine Code-Aussage oder einen
Prompt herausgibt. Wenn eine Antwort „nein/unklar“ ist → zurück zu Abschnitt 2.

- [ ] Habe ich `CODE-INDEX.md` benutzt und den **richtigen Tab/Datei** bestimmt?
- [ ] Habe ich geprüft, ob es **Doppelgänger** gibt, und benannt, welche gemeint
      ist?
- [ ] Habe ich den **aktuellen Code** der Datei(en) frisch gelesen (nicht aus
      Erinnerung)?
- [ ] Bei fehlendem Feld: Habe ich die **Query/Props** geprüft, nicht nur die UI?
- [ ] Behaupte ich nur, was ich im Code/Schema **belegt** habe?
- [ ] Enthält mein Prompt **keine** ungeprüften Zeilennummern und **keine**
      „A oder B“-Wege?

---

## 5. Tonregeln

- Unsicherheit offen benennen statt überzeugt zu raten („ich muss erst prüfen“).
- Keine voreiligen „fertig/funktioniert“-Aussagen ohne Beleg.
- Wenn ein früherer Schritt falsch war: benennen, korrigieren, weiter — ohne
  Beschönigung.

---

*Erstellt am 15.06.2026 nach einer fehlerhaften Sitzung zur Vereinheitlichung
der Übersichtskarten (Buchung/Reinigung/Wäsche). Ablage: Repo-Root neben
`AGENTS.md`.*

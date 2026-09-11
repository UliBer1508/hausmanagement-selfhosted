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

## 1b. Vorfall 11.09.2026: Build-Regel bekannt, aber nicht ausgeführt

Beim Umbau `booked_guests` → `delta_guests` (Bedeutungsänderung, Commit
`6340360`) wurde in `CreateBookingForm.tsx` die Variable `offenerStand` im
JSX verwendet, aber nie deklariert. Ergebnis: `ReferenceError` bei jedem
Rendern der Komponente — die Buchungsübersicht war für jeden Klick auf eine
Buchungskarte funktionsunfähig, bis zum nächsten Uli-Login unbemerkt.

**Der Fehler selbst war nicht ungewöhnlich** — bei textbasierter
Code-Erzeugung über mehrere Antwortblöcke hinweg passiert das. **Das
eigentliche Versagen war organisatorisch:** CODING-GUIDE A4.10 und
PROJEKT-REGELN Schritt 5 schreiben "Build muss sauber sein" bereits
verbindlich vor — die Regel wurde nicht übersprungen, weil sie fehlte,
sondern weil "Build prüfen" ohne echten Compiler-Lauf als erledigt
angenommen wurde. Ein `tsc --noEmit` gegen die Datei (auch ohne die vollen
Projekt-Abhängigkeiten, `--skipLibCheck` reicht) hätte den Fehler mit
`TS2304: Cannot find name 'offenerStand'` sofort gezeigt.

**Verbindlich ab sofort:** "Build prüfen" heißt **ein tatsächlicher
Compiler-Lauf**, nicht eine Einschätzung "sieht richtig aus". Bei jeder
Änderung an einer `.tsx`/`.ts`-Datei, die vor der Übergabe nicht ohnehin im
echten Projekt gebaut wird: mindestens `tsc --noEmit --skipLibCheck` gegen
die geänderte Datei laufen lassen und auf `TS2304`/`TS2307`-Fehler prüfen,
bevor der Code als fertig gilt.

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
- [ ] Habe ich einen ECHTEN Compiler-Lauf (`tsc --noEmit`, mind. gegen die
      geänderte Datei) gemacht — nicht nur den Code gelesen und für plausibel
      befunden?

---

## 5. Tonregeln

- Unsicherheit offen benennen statt überzeugt zu raten („ich muss erst prüfen“).
- Keine voreiligen „fertig/funktioniert“-Aussagen ohne Beleg.
- Wenn ein früherer Schritt falsch war: benennen, korrigieren, weiter — ohne
  Beschönigung.

---

*Erstellt am 15.06.2026 nach einer fehlerhaften Sitzung zur Vereinheitlichung
der Übersichtskarten (Buchung/Reinigung/Wäsche). Ablage: Repo-Root neben
`AGENTS.md`. Ergänzt am 11.09.2026 (Abschnitt 1b, Selbst-Check) nach dem
`offenerStand`-Vorfall in `CreateBookingForm.tsx`.*

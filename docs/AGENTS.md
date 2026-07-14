# AGENTS.md — Arbeitsanweisung für KI-Agenten

Diese Datei ist verbindlich und wird von KI-Agenten im Repo-Root automatisch
gelesen.

---

## ⚠️ ZUERST: Die Soll-Definition steht in der DATENBANK, nicht im Repo

Bei **allem, was Max betrifft** (Reinigung, Wäsche, Buchungsanfragen,
Provider-Kommunikation) gilt: Die verbindliche Ablauf-Definition liegt in der
Tabelle **`max_ablaeufe`** — *nicht* im Repo, *nicht* im Code.

**Vor jeder Arbeit an Max abfragen:**
```sql
select aktion, aktion_label, ausloeser, variante, schritt_nr,
       akteur, schritt, ergebnis_status, karte, funktion, umsetzung, notiz
from public.max_ablaeufe
order by aktion, variante, schritt_nr;

select term, meaning, category from public.assistant_knowledge where is_active;
```

Sie definiert je Fall: **Schritt → Akteur (uli/max/amela/teuni/system) → Funktion
→ Ergebnis-Status**. Wer sie nicht liest, baut an der Definition vorbei.

> **Am 13.07.2026 wurde genau dieser Fehler zweimal gemacht.** Ein geplanter Umbau
> des Reschedule-Ablaufs musste verworfen werden, weil er der Definition
> widersprach: Er hätte eine Chat-Rückfrage eingebaut, die dort gar nicht
> vorgesehen ist — **`draft` IST bereits die Freigabestufe**. Die Änderung ist
> folgenlos, bis Uli in der Karte auf „Geplant" setzt.

---

## ⚠️ Und: Nicht alles läuft über Gemini

`chat-assistant/serve()` hat **zwei Wege**:

1. **Deterministische Pfade** — Regex-Erkennung im Nutzertext, führen **direkt
   aus**. Gemini wird **nie gefragt**. Betrifft: **Begrüßungs-E-Mail** und
   **Reschedule** (Pfade A/B/C).
2. **Gemini-Pfad** — alles andere, mit den 26 Tools.

**Folge:** Die Tool-Definitionen zu lesen genügt nicht. Eine Änderung an der
Beschreibung von `reschedule_cleaning` wirkt auf *„verschiebe die Reinigung von
Luca"* **überhaupt nicht** — dieser Satz trifft Pfad A.
Siehe `docs/chat-assistant-aenderungen.md`.

---

## Vor JEDER Code-Änderung
0. `docs/ARBEITSWEISE-CLAUDE-LESSONS.md` lesen. Dort stehen die Fehler, die schon
   gemacht wurden — sie wiederholen sich sonst. Nicht optional.
1. `docs/CODE-INDEX.md` lesen und die richtige Datei bestimmen
   (Tab -> Kette -> Doppelgänger). Nicht raten, welche von mehreren ähnlichen
   Dateien gemeint ist.
2. `docs/CODING-GUIDE.md`, Teil A (Muss-Block), befolgen.
3. Zieldatei ganz lesen, bevor eine Zeile geändert wird.
4. Fehlt ein Feld in der UI: zuerst die Supabase-Query bzw. die Props prüfen,
   dann erst die Anzeige. Ein fehlendes Feld ist meist ein Query-Problem.
5. **„deployt" ist nicht „geprüft".** Kein Häkchen ohne beobachtetes Verhalten in
   der laufenden App.

## Architektur-Kernfakt
- KEIN Seiten-Routing. Alles hängt an Tabs in `src/pages/OriginalDashboard.tsx`
  (`switch(activeTab)`). Immer fragen "welcher Tab?", nicht "welche Route?".
- Details und vollständige Tab->Komponente-Liste: `docs/CODE-INDEX.md`.
- **Ein Teil der Geschäftslogik liegt NICHT im Code, sondern in DB-Triggern**
  (Max' Kommunikationskette: Amela benachrichtigen, Vorgänge abschließen,
  Provider-Antworten fortschreiben). Nachzulesen in `supabase/SQL/`. Wer nur den
  TypeScript-Code liest, übersieht die Hälfte der Wirkung.

## Häufigste Fehlerquelle: Doppelgänger — auf DREI Ebenen

**1. Komponenten**
- "Reinigungskarte" existiert dreimal: `Cleaning/CleaningManagement.tsx`
  (breit, inline) | `Bookings/ServiceTaskCard.tsx` (schmal, verknüpfte Ansicht)
  | `Operations/CleaningsCard.tsx` (Übersichtskachel).
- "Wäschekarte": `Bookings/LaundryOrderCard.tsx` ist DIE Karte (Lieferschein),
  Wrapper `LaundryOrderCardWithStatus.tsx`; `Operations/LinenDeliveriesCard.tsx`
  ist nur die Übersichtskachel.
- `Bookings/ConnectedBookingView.tsx` hat EIGENE Supabase-Queries -> Felder dort
  separat laden, auch wenn sie woanders schon geladen werden.

**2. Funktionen mit gleichem Muster**
`create_linen_for_booking` und `update_linen_for_booking` hatten denselben Bug —
gefixt wurde nur eine, und die Doku meldete „erledigt". Wer eine Stelle repariert,
muss **aktiv nach der Zwillingsstelle suchen** (`grep` nach demselben Aufruf,
derselben Bedingung).

**3. AUFRUFER (13.07.2026 teuer gelernt)**
`executeRescheduleCleaning` wurde um `logMaxAction` ergänzt — **obwohl die beiden
deterministischen Pfade, die sie aufrufen, bereits selbst loggten**. Folge: zwei
`max_actions`-Einträge pro Verschiebung, der Vorgang erschien doppelt.
**Vor dem Ändern einer Funktion immer prüfen, WER sie aufruft und was der schon tut.**

## Kernregeln
- Minimal-invasiv ändern; keine zweite, fast gleiche Komponente bauen, wenn eine
  bestehende erweitert werden kann.
- UI-Texte Deutsch, Code-Bezeichner Englisch.
- Importe über `@/`-Alias (keine `../../../`-Pfade).
- Funktionale Komponenten, `export default` (Repo-Standard).
- Daten über React Query (`useQuery`/`useMutation`); Query-Keys als kebab-case
  Arrays; nach Mutationen invalidieren.
- Supabase-Client aus `@/integrations/supabase/client`.
  `integrations/supabase/types.ts` NIE von Hand editieren (generiert).
- Im `.select` nur nötige, aber ALLE von der UI angezeigten Felder laden.
- Styling: Tailwind + shadcn/ui; Klassen mit `cn()` aus `@/lib/utils`;
  `components/ui/*` nur verwenden, nicht umbauen.
- Nutzer-Feedback über `useToast` (Deutsch; Fehler: `variant: "destructive"`);
  Technik in `console.error('[Kontext]', e)`.
- Keine Secrets im Frontend. Beträge serverseitig als Quelle der Wahrheit.

## Abschluss jeder Änderung
- Build muss fehlerfrei sein (TypeScript/Vite), keine ungenutzten Imports,
  kein `console.log`.
- Betroffene Doku im selben Schritt aktualisieren (v. a. `docs/CODE-INDEX.md`).
- Kurz-Changelog ausgeben: was / welche Dateien / warum / welche Felder.

## Nicht tun
- Englische UI-Texte. Tiefe relative Importe. Doppel-Komponenten.
- Großflächiges Reformatieren fremder Zeilen "nebenbei".
- Abschließen ohne Build-Check und ohne Index-Pflege.
- Aus Screenshots schließen — an der Quelle (API/DB) nachsehen.
  `raw.githubusercontent.com` liefert veraltete Cache-Stände; die GitHub-API ist
  verlässlich.

## Ausführliche Referenzen im Repo
- `docs/CODE-INDEX.md` — vollständige Landkarte des Codes
- `docs/CODING-GUIDE.md` — vollständiger Coding-Standard
- `docs/Steinbock-Chalets-Gesamtdokumentation-MASTER.md` — Architektur-/System-Doku
- `docs/ARBEITSWEISE-CLAUDE-LESSONS.md` — Lehren aus fehlgelaufenen Sitzungen (PFLICHT)
- `docs/Prozess-Reinigung-Terminaenderung.md` — der abgestimmte Reschedule-Ablauf
- `docs/chat-assistant-aenderungen.md` — die deterministischen Pfade
- `supabase/SQL/README.md` — die DB-Trigger, die Max' Kommunikationskette steuern

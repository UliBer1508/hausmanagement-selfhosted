# AGENTS.md — Arbeitsanweisung für KI-Agenten (Lovable, Claude)

Diese Datei wird vom Lovable-Agenten immer gelesen (unabhängig von der
Session-Länge) und gilt zusätzlich für Claude. Sie ist verbindlich.

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

## Architektur-Kernfakt
- KEIN Seiten-Routing. Alles hängt an Tabs in `src/pages/OriginalDashboard.tsx`
  (`switch(activeTab)`). Immer fragen "welcher Tab?", nicht "welche Route?".
- Details und vollständige Tab->Komponente-Liste: `docs/CODE-INDEX.md`.
- **Ein Teil der Geschäftslogik liegt NICHT im Code, sondern in DB-Triggern**
  (Max' Kommunikationskette: Amela benachrichtigen, Vorgänge abschließen,
  Provider-Antworten fortschreiben). Nachzulesen in `supabase/SQL/`. Wer nur den
  TypeScript-Code liest, übersieht die Hälfte der Wirkung.

## Häufigste Fehlerquelle: Doppelgänger-Komponenten
- "Reinigungskarte" existiert dreimal: `Cleaning/CleaningManagement.tsx`
  (breit, inline) | `Bookings/ServiceTaskCard.tsx` (schmal, verknüpfte Ansicht)
  | `Operations/CleaningsCard.tsx` (Übersichtskachel).
- "Wäschekarte": `Bookings/LaundryOrderCard.tsx` ist DIE Karte (Lieferschein),
  Wrapper `LaundryOrderCardWithStatus.tsx`; `Operations/LinenDeliveriesCard.tsx`
  ist nur die Übersichtskachel.
- `Bookings/ConnectedBookingView.tsx` hat EIGENE Supabase-Queries -> Felder dort
  separat laden, auch wenn sie woanders schon geladen werden.

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
- **Schreibende Supabase-Kommandos IMMER mit `.select()`** und Prüfung auf
  `data.length === 0`. Ohne `.select()` liefert ein `update`/`delete` auch dann
  `error === null`, wenn null Zeilen betroffen waren (RLS, falsche ID) — der
  Nutzer bekäme eine Erfolgsmeldung für einen stillen Fehlschlag. Review
  22.07.2026: 89 solcher Stellen im Repo; für neuen Code ist die Regel bindend.
- **Schreibzugriffe auf `bookings` über `useBookings`**, nicht direkt auf die
  Tabelle. Der Hook aktualisiert den lokalen State (`forceRefresh()`); wer daran
  vorbei schreibt, muss das selbst tun — sonst wird gespeichert, aber die alte
  Anzeige bleibt stehen und es sieht aus wie ein Speicherfehler (Lessons 9.1).
  Lesezugriffe sind unkritisch. Fehlt eine passende Schreibfunktion im Hook:
  dort ergänzen, nicht in der Komponente umgehen.
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

## Ausführliche Referenzen im Repo
- `docs/CODE-INDEX.md` — vollständige Landkarte des Codes
- `docs/CODING-GUIDE.md` — vollständiger Coding-Standard
- `docs/Steinbock-Chalets-Gesamtdokumentation-MASTER.md` — Architektur-/System-Doku
- `docs/ARBEITSWEISE-CLAUDE-LESSONS.md` — Lehren aus fehlgelaufenen Sitzungen (PFLICHT)
- `supabase/SQL/README.md` — die DB-Trigger, die Max' Kommunikationskette steuern

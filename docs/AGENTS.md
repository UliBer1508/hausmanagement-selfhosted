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

## LAUFENDE MIGRATION: Gastdaten (Stand 12.08.2026)

**`guests` ist die einzige Quelle für Gastdaten. Eine Buchung verweist über
`guest_id`.** Die `guest_*`-Spalten in `bookings` sind historische Kopien aus
einer noch nicht abgeschlossenen Migration und **keine Quelle für Auswertungen,
Gruppierungen oder Kontaktaufnahme**.

Warum das hier steht: Der Plan dazu existiert seit 2024
(`Guest-Booking-Separation-Plan.md`), war aber in keinem Pflichtdokument
verlinkt. Folge: Am 11.08.2026 wurde ein Gast auf der Buchungskarte als "Neuer
Gast" gezeigt, obwohl er zwei Buchungen hatte — eine Auswertung hatte über die
Kopie statt über `guest_id` gruppiert. Beim Beheben wurde die Übergangslogik
zunächst sogar noch erweitert, weil niemand von der offenen Migration wusste.

**Verbindlich für neuen Code:**
- Gastdaten IMMER über die Relation lesen: `guests(...)` mitladen und die Helfer
  aus `src/lib/guestHelpers.ts` nutzen (`getGuestName`, `getGuestEmail` …).
- NIE über `guest_email` oder `guest_name` gruppieren oder Gäste identifizieren.
  `guest_email` ist bei 65 % der Buchungen leer und bei Portalbuchungen eine
  Wegwerfadresse. Schlüssel ist `guest_id`.
- Wer eine bestehende Stelle anfasst, die noch aus den Kopien liest, zieht sie
  im selben Schritt auf die Relation um.
- `guest_contact_status` ist KEINE Kopie — sie ist buchungsbezogen und bleibt.

Stand und Etappenplan: **`docs/Konzept-Gastdaten-Entdopplung.md`**. Etappe 2 und
3 sind seit 12.08.2026 live (DB-Trigger `trg_link_guest_on_booking_insert` und
`trg_sync_guest_to_bookings`, SQL in `supabase/SQL/40_...`). Etappe 4 läuft:
**33 von 45 Abfragen umgestellt** (Stand 13.08.2026), `chat-assistant` bis auf
drei `select('*')` vollständig. Offen: elf `select('*')`-Abfragen, danach
Etappe 5 (Schreibpfade autark) und Etappe 6 (Kopiespalten löschen).

**Einheit ist die Abfrage, nicht die Anzeigezeile.** Wird direkt nach der
Abfrage einmal gemappt (`guest_name: b.guests?.name || b.guest_name`), bleiben
alle nachgelagerten Anzeigestellen unverändert korrekt. Wer Anzeigezeilen zählt,
kommt auf ~317 und überschätzt die Aufgabe um das Siebenfache.
Arbeitsstand je Abfrage: `docs/Etappe4-Bestandsaufnahme-Abfragen.md`.

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
- `docs/Konzept-Gastdaten-Entdopplung.md` — LAUFENDE Migration Gastdaten (PFLICHT
  bei allem, was Gäste oder Buchungen berührt)

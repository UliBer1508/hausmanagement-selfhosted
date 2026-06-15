# CODING-GUIDE — Verbindlicher Standard für dieses Projekt

> **Status: VERBINDLICH (Muss).** Gilt für **Lovable** und **Claude** bei jeder
> Code-Änderung in diesem Repo. Abweichungen nur mit ausdrücklicher Begründung
> im Commit/PR-Text. Bei Konflikt zwischen diesem Guide und einer Einzelanweisung
> gewinnt die Einzelanweisung des Eigentümers — der Rest des Guides bleibt gültig.
>
> Letzte Aktualisierung: 15.06.2026 · Stand-Commit: `83b07ce`

---

## TEIL A — DER MUSS-BLOCK (vor jeder Änderung)

Diese Punkte sind **nicht verhandelbar**. Lovable und Claude führen sie bei
**jeder** Aufgabe aus, auch bei „kleinen" Änderungen.

### A1. Erst finden, dann ändern
1. **`CODE-INDEX.md` lesen** und die Zieldatei über Tab → Kette → Doppelgänger
   bestimmen. Nicht raten, welche von mehreren ähnlichen Dateien gemeint ist.
2. Die Zieldatei **ganz öffnen und lesen**, bevor eine Zeile geändert wird.
3. Bei „Karte zeigt Feld nicht": **zuerst die Datenquelle prüfen** (Supabase-
   `select` / Prop), erst dann die Anzeige. Ein fehlendes Feld ist oft ein
   Query-Problem, kein UI-Problem.

### A2. Minimal-invasiv arbeiten
4. Nur ändern, was die Aufgabe verlangt. **Kein** ungefragtes Umbenennen,
   Umsortieren, „Aufräumen" oder Reformatieren fremder Zeilen.
5. **Keine** parallele zweite Komponente für denselben Zweck anlegen, wenn eine
   bestehende erweitert werden kann (sonst entsteht ein neuer „Doppelgänger").
   Wenn doch nötig: in `CODE-INDEX.md`, Abschnitt 3 eintragen.
6. Geteilte Logik gehört in `hooks/` (Daten/State) oder `lib/` (reine Helfer) —
   **nicht** kopiert in mehrere Komponenten.

### A3. Sicherheit & Daten
7. **Keine Secrets im Frontend.** Service-Keys, Stripe-Secrets, Webhook-Secrets
   nur in Edge-Function-Secrets. Im Browser nur der Supabase **anon**-Key.
8. **Beträge/Preise serverseitig** als Quelle der Wahrheit behandeln (nicht aus
   dem Browser an Zahlungen weiterreichen). Siehe Stripe-Konzeptdokumente.
9. **Nie** `integrations/supabase/types.ts` von Hand editieren (generiert).

### A4. Nach der Änderung
10. **Build muss sauber sein** (`tsc` / Vite ohne Fehler) — keine roten
    TypeScript-Fehler, keine ungenutzten Imports.
11. **Doku nachziehen im selben Commit:** betroffene Datei in `CODE-INDEX.md`
    aktualisieren; bei Architektur-/Konzeptänderung das passende `docs/`-File.
12. **Kurz-Changelog** in die Antwort/PR: *was* geändert, *welche Dateien*,
    *warum*, und *welche Felder/Queries* betroffen waren.

> **Checkliste in einem Satz:** Index gelesen → richtige Datei verifiziert →
> Datenquelle geprüft → minimal geändert → Build grün → Doku & Changelog nachgezogen.

---

## TEIL B — WIE CODE GESCHRIEBEN WIRD

Diese Regeln spiegeln den **bestehenden** Stil des Repos wider, damit neuer Code
sich nahtlos einfügt.

### B1. Sprache
- **UI-Texte: Deutsch** (Labels, Buttons, Toast-Titel, Fehlermeldungen).
- **Code-Bezeichner: Englisch** (Variablen, Funktionen, Props, Dateinamen).
- **Kommentare:** Deutsch oder Englisch, aber sinnvoll und knapp.

### B2. TypeScript & React
- **Funktionale Komponenten** mit Hooks. Eine Hauptkomponente pro Datei,
  **`export default`** (Repo-Standard).
- **Imports immer über `@/`-Alias** (`@/components`, `@/hooks`, `@/lib`,
  `@/integrations`, `@/types`) — keine tiefen `../../../`-Pfade.
- Props als `interface XxxProps`. Optionale Felder mit `?` und sicherem Zugriff
  (`obj?.feld`), besonders bei verknüpften Daten, die `null` sein können
  (z. B. `order.bookings?.check_in`).
- `any` vermeiden; wo Supabase-Rohdaten noch nicht typisiert sind, lokal eng
  typisieren statt projektweit `any` zu streuen.

### B3. Daten: TanStack React Query + Supabase
- Lesen/Schreiben über **React Query** (`useQuery`/`useMutation`), nicht via
  ad-hoc `useEffect`-Fetch.
- **Query-Keys** als sprechende Arrays, Kebab-Case, mit Parametern:
  `['linen-orders-list']`, `['linen-set-definition', houseId]`.
- Nach Mutationen die betroffenen Keys **invalidieren**
  (`queryClient.invalidateQueries({ queryKey: [...] })`).
- Supabase-Client **immer** aus `@/integrations/supabase/client`.
- In `.select('...')` **nur** Felder anfordern, die gebraucht werden — aber
  **alle**, die die UI anzeigt (fehlende Felder = leere Karten).

### B4. Styling
- **Tailwind + shadcn/ui.** Keine eigenen CSS-Dateien pro Komponente.
- Klassen mit **`cn()`** aus `@/lib/utils` zusammensetzen (bedingte Klassen).
- `components/ui/*` nur **verwenden**, nicht umbauen.
- Responsives Raster wie im Bestand (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`);
  für gleichartige Karten dasselbe Muster nutzen (Konsistenz vor Kreativität).

### B5. Feedback, Fehler, Logging
- Nutzer-Feedback über **`useToast`** (`@/hooks/use-toast`); Titel deutsch,
  bei Fehlern `variant: "destructive"` und verständliche `description`.
- Technische Details in `console.error('[Kontext]', error)` — nicht in die UI.
- Risiko-Operationen (Löschen, Stornieren, Senden) mit **Bestätigung** absichern.

### B6. Datum & Zahlen
- **Bevorzugt `date-fns` mit `locale: de`** für Formatierung (überwiegender
  Bestand). `toLocaleDateString('de-DE')` ist toleriert, aber bei neuer/erweiterter
  Logik `date-fns` wählen, damit es konsistenter wird.
- Datums-Helfer aus `@/lib/dateHelpers` verwenden, wenn vorhanden.
- Geldbeträge mit `.toFixed(2)` + Währung (`EUR`/`€`) anzeigen.

### B7. Struktur & Ablage
- Neue Komponente in das **fachlich passende Modul** unter `src/components/<Modul>/`.
- Reine Berechnung/Formatierung → `src/lib/`. Daten/State/Server → `src/hooks/`.
- Keine Geschäftslogik in `components/ui/` oder in `OriginalDashboard.tsx`
  „zwischenparken".

### B8. Barrierefreiheit & UX (leichtgewichtig)
- Klickbare Karten: vorhandene Muster nutzen (`ClickableCard` bzw.
  `role/tabIndex/aria-label` wie in bestehenden Karten).
- Buttons/Icons mit `aria-label`, wenn nur ein Icon sichtbar ist.

---

## TEIL C — PR/COMMIT-FORMAT

Jede Änderung wird so zusammengefasst (kurz, deutsch):

```
Titel: <Modul>: <was geändert>

- Dateien: <pfad1>, <pfad2>
- Grund: <warum>
- Daten: <welche Query/Felder/Props betroffen>
- Doku: CODE-INDEX.md aktualisiert? (ja/nein, was)
- Build: grün
```

Beispiel:
```
Wäsche: Buchungsinfos auf LaundryOrderCard ergänzt

- Dateien: Bookings/LaundryOrderCard.tsx, Bookings/ConnectedBookingView.tsx
- Grund: Karte zeigte Zeitraum & Personenzahl nicht
- Daten: bookings.check_in/check_out/number_of_guests; Query in
  ConnectedBookingView erweitert (LinenOrdersList lud bereits)
- Doku: Notes-Quick-Edit-And-Compact-Cards.md ergänzt
- Build: grün
```

---

## TEIL D — ANTI-PATTERNS (nicht tun)

- ❌ Zweite, fast gleiche Komponente bauen, statt die bestehende zu erweitern.
- ❌ Felder in der Karte anzeigen, ohne sie in der Query zu laden (oder umgekehrt).
- ❌ Tiefe relative Importe (`../../../`) statt `@/`-Alias.
- ❌ Secrets/Service-Keys im Frontend.
- ❌ `integrations/supabase/types.ts` händisch ändern.
- ❌ Großflächiges Reformatieren fremder Zeilen „nebenbei".
- ❌ Änderung abschließen ohne Build-Check und ohne `CODE-INDEX.md`-Pflege.
- ❌ Englische UI-Texte einstreuen.

---

## TEIL E — DAMIT ES WIRKT (Verankerung)

Damit dieser Standard von Lovable und Claude **tatsächlich** befolgt wird:

1. Beide Dokumente (`CODING-GUIDE.md`, `CODE-INDEX.md`) liegen im Repo-Root bzw.
   `docs/` und sind Teil des **Project Knowledge**.
2. In Lovable als feste Projekt-Regel hinterlegen (Knowledge/Instructions):
   *„Vor jeder Code-Änderung CODE-INDEX.md zum Auffinden und CODING-GUIDE.md
   (Teil A Muss-Block) befolgen. Build muss grün sein, Index/Doku im selben
   Schritt pflegen."*
3. Bei Aufgaben an Claude genügt der Verweis „nach CODING-GUIDE/CODE-INDEX
   arbeiten" — beide Dateien werden dann zuerst herangezogen.

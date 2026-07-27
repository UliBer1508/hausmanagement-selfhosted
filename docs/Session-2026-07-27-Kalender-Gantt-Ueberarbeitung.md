# Session 2026-07-27 — Kalender-Übersicht überarbeitet (Gantt-Chart)

> Zweck dieser Datei: Nachvollziehbarkeit für künftige Sitzungen (Mensch oder KI).
> Ergänzt `docs/CODE-INDEX.md` Abschnitt 5 (Modul „Kalender"). Bei nächster
> größerer Kalender-Änderung: Inhalt hier prüfen, dann in CODE-INDEX überführen.

## Ausgangslage

Drei bestehende Kalender-Ansichten hatten unterschiedliche Schwächen:
- **Website-Kalender** (`AvailabilityCalendar.tsx`, `web-takeover-buddy`) — gut für
  Gäste (ein Haus, An-/Abreise diagonal dargestellt), aber bewusst ohne Namen/
  interne Daten. Falsches Werkzeug für interne Übersicht — bleibt unverändert.
- **Monatsansicht** (`CalendarTab.tsx`, Tab „Kalender") — zeigt beide Häuser in
  gemeinsamen Tages-Zellen, überladen (`+X mehr`), Reinigung/Wäsche gehen unter.
- **Gantt-Chart** (`BookingTimeline.tsx`, Button „📊 Timeline" im Kalender-Tab) —
  zeigte nur Buchungsbalken, keine Reinigung/Wäsche, sprang beim Blättern immer
  einen ganzen Monat, keine Klick-Details.

## Recherche-Ergebnis (27.07.2026)

Verglichen: Guesty, Mashvisor, RentalReady, Jurny, Hostaway (Multi-Property-PMS)
sowie innRoad, WebRezPro, SkyTouch, eZee, RoomKeyPMS (Hotel-PMS/Tape-Chart).

**Befund:** Kein geprüftes System nutzt ein Monatsraster mit Tages-Zellen für die
Objektübersicht. Der Standard ist der **Tape Chart** (Hotelbranche) bzw.
**Multi-Calendar** (Ferienhaus-PMS) — exakt das Gantt-Chart-Muster: Objekt als
Zeile, Tage als Spalten, Housekeeping-Status direkt am Balken. Konsequenz:
**keine neue Monatsansicht bauen** — stattdessen den Gantt-Chart ausbauen.

## Was umgesetzt wurde

**`BookingTimeline.tsx`** (komplett überarbeitet):
- Reinigungs-/Wäsche-Icons **im Buchungsbalken** (nicht als separate Tages-Events),
  zugeordnet über `booking_id` (nicht über Datum — Reinigung/Wäsche liegen fast
  immer vor dem Check-in der zugehörigen Buchung, nicht während ihres Aufenthalts).
  Blass = Entwurf/offen, voll eingefärbt = bestätigt. Klickbar (stoppt Propagation
  zum Buchungs-Klick).
- Rollendes 3-Monats-Fenster (Vormonat/aktueller/Folgemonat) statt starrem
  Einzelmonat — echtes horizontales Scrollen möglich, Auto-Scroll zu heute beim
  Öffnen. ◀/▶ verschiebt das Fenster nur noch um einen Monat (Überlappung sorgt
  für kontinuierliches Gefühl statt hartem Sprung).
- Objekt-Spalte (sticky links) hatte halbtransparenten Hintergrund
  (`bg-muted/50`/`bg-muted/30`) — dadurch schimmerten Balken beim Scrollen durch.
  Behoben: feste, deckende Hintergrundfarbe.
- Legende-Fußzeile auf Wunsch entfernt (unnötig, Platzverbrauch mobil).

**`CalendarTab.tsx`**:
- Zwei vorbestehende Feldnamen-Fehler behoben: Detail-Anzeige las
  `selectedEvent.cleaning.date`/`.laundry.items.join()`, tatsächliche Felder sind
  `.scheduled_date`/`.status`/`.delivery_date`. Vorher zeigte ein Klick auf
  Reinigung/Wäsche in der Monatsansicht nur den Haus-Namen, nie Datum/Status —
  und `.items.join()` hätte bei aktivierter Verknüpfung abgestürzt (items ist ein
  Objekt, kein Array).
- Detail-Anzeige von fester Seitenkarte auf **Popup (`Dialog`)** umgestellt —
  Platzgrund mobil, einheitlich für alle Ansichten (Buchung/Reinigung/Wäsche/frei).
- Separate „Legende"-Karte im Sidebar entfernt.
- Timeline-Ansicht wieder volle Breite (kein Sidebar-Bedarf mehr, da Details im
  Popup und keine Legende mehr nötig).

## Offener Punkt / Vorschlag (noch nicht umgesetzt, Stand 27.07.2026)

Automatische Kollisions-Markierung im Gantt-Chart: wenn an einem Tag **beide**
Häuser gleichzeitig Reinigung, Wäschelieferung oder Check-in haben, farbige
Markierung der Tagesspalte (z. B. gelb) + kurzer Hinweistext unter der Timeline.
Zweck: Amela/Teuni können nicht zwei Häuser gleichzeitig bedienen — das muss beim
Blick auf den Kalender sofort auffallen, nicht erst beim Vergleichen einzelner
Zeilen. Mockup mit Uli abgestimmt, Umsetzung noch offen.

## Bewusst NICHT geändert

- Website-Kalender (`AvailabilityCalendar.tsx`) — bleibt Gäste-Ansicht, ein Haus,
  keine internen Daten.
- Lücken-/Vermietbarkeits-Logik — ursprünglich angefragt, aber vom eigentlichen
  Kernproblem (Übersichtlichkeit) abgelöst; nicht umgesetzt.

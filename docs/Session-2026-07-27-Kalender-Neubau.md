# Session 2026-07-27 — Kalender-Übersicht neu gebaut

> Zweck: Nachvollziehbarkeit für künftige Sitzungen (Mensch oder KI).
> Ergänzt `docs/CODE-INDEX.md` (Modul „Kalender") und
> `docs/ARBEITSWEISE-CLAUDE-LESSONS.md` (Abschnitt „Stiller Fehlschlag", unten).

---

## 1. Ausgangslage

Drei Kalender-Ansichten, jede mit eigener Schwäche:

| Ansicht | Datei | Problem |
|---|---|---|
| Website-Kalender | `AvailabilityCalendar.tsx` (`web-takeover-buddy`) | gut lesbar (diagonale Wechseltage), aber bewusst nur EIN Haus, keine internen Daten → als interne Übersicht ungeeignet. **Unverändert geblieben.** |
| Monatsansicht | `CalendarTab.tsx` | beide Häuser in gemeinsamen Tages-Zellen → überladen, `+X mehr`, Reinigung/Wäsche gingen unter |
| Wochenansicht | `CalendarTab.tsx` | dasselbe Problem, zusätzlicher Pflegeaufwand ohne Mehrwert |
| Gantt-Chart | `BookingTimeline.tsx` | nur Buchungsbalken; keine Reinigung/Wäsche, harte Monatssprünge, keine Klick-Details |

## 2. Recherche (27.07.2026)

Verglichen: **Ferienhaus-PMS** (Guesty, Mashvisor, RentalReady, Jurny, Hostaway)
und **Hotel-PMS** (innRoad, WebRezPro, SkyTouch, eZee, RoomKeyPMS).

**Befund:** Kein einziges dieser Systeme nutzt ein Monatsraster mit Tages-Zellen
für die Objektübersicht. Standard ist der **Tape Chart** (Hotellerie) bzw.
**Multi-Calendar** (Ferienhaus): Objekt = Zeile, Tag = Spalte, Housekeeping-Status
direkt am Balken. WebRezPro koppelt den Tape Chart ausdrücklich an den
Housekeeping-Report, damit die Rezeption sieht, welches Zimmer für die nächste
Anreise bereit ist.

**Konsequenz:** Kein weiteres Monatsraster bauen. Stattdessen zwei Ansichten, die
beide dem Zeilen-pro-Objekt-Prinzip folgen — nur in unterschiedlicher Dichte.

## 3. Zielbild (umgesetzt)

Der Kalender-Tab hat jetzt **zwei** Ansichten (Wochenansicht ersatzlos entfernt):

- **Monat** (`HouseStackedCalendar.tsx`, NEU) — Häuser untereinander, Tage als
  Spalten, Einzeltag-Kästchen im Website-Stil (frei / belegt / Anreise / Abreise /
  Wechseltag diagonal). Zweck: „Wechseln beide Häuser am selben Tag?" auf einen
  Blick über den ganzen Monat.
- **Timeline** (`BookingTimeline.tsx`) — durchgehende Buchungsbalken, für
  Aufenthaltsdauer und Lücken. Bleibt das Tape-Chart-Werkzeug.

Beide zeigen Reinigung/Wäsche als klickbare Icons und öffnen dasselbe Popup.

## 4. Was geändert wurde

**`src/lib/utils.ts`**
- **NEU `getHouseColors(houseName)`** — eine Quelle für Hausfarben (Timeline +
  Monatsansicht). Abgleich über Namensbestandteile, nicht über exakte Namen.
- `getHouseIcon()` korrigiert: prüfte nur auf `'siedlung'` und traf das
  Venediger Chalet nie → zeigte still das allgemeine 🏠. `'venediger'` ergänzt.

**`src/components/Calendar/HouseStackedCalendar.tsx` (NEU)**
- Häuser gestapelt, Tage als Spalten, Diagonal-Muster von der Website übernommen
- Gastname (Vorname) nur in voll belegten Kästchen
- Reinigung/Wäsche als 20px-Icons INNERHALB der Zelle, auf dem **echten**
  Termin (`scheduled_date` / `delivery_date`), nicht am Check-in-Tag
- Drei Monate untereinander, vertikal scrollbar, Auto-Sprung zum aktuellen Monat
- Zellfarben je Haus (cyan/amber) statt einheitlich rot

**`src/components/Calendar/BookingTimeline.tsx`**
- Reinigungs-/Wäsche-Icons IM Balken, zugeordnet über `booking_id`
  (bewusst anders als in der Monatsansicht — ein Balken hat keine Tagesspalte)
- Rollendes 3-Monats-Fenster, echtes horizontales Scrollen, Auto-Scroll zu heute
- Objekt-Spalte deckend (war halbtransparent → Balken schimmerten durch)
- Legende entfernt; Namensspalte 104px, Namen fett; Icons 18px
- `w-max` auf Kopfzeile und Haus-Zeilen (siehe Abschnitt 5, Punkt B)

**`src/components/Dashboard/CalendarTab.tsx`**
- Monats-/Wochenansicht ersetzt, „Woche"-Knopf entfernt
- Detail-Anzeige von fester Seitenkarte auf **Popup (`Dialog`)** umgestellt
  (Platzgrund auf dem Handy), einheitlich für beide Ansichten
- Legende-Karte entfernt
- Doppelten `overflow-x-auto` entfernt (siehe Abschnitt 5, Punkt B)

## 5. Gefundene Fehler — und was daraus zu lernen ist

### A) Hausname als Schlüssel → stiller Rückfall auf Grau  ⚠️ WICHTIGSTE LEHRE

`BookingTimeline.tsx` hielt eine Farbtabelle mit dem **exakten** Hausnamen als
Schlüssel:

```ts
'Venedigersiedlung Chalet': { bg: 'bg-amber-400', … },
'default':                  { bg: 'bg-gray-400',  … }
```

Das Haus heißt aber **„Venediger Chalet"**. Der Schlüssel traf nie, die
Komponente fiel auf `default` = Grau zurück. **Kein Fehler, keine Warnung,
kein Absturz** — nur eine falsche Farbe, die monatelang niemandem auffiel.
Dieselbe Tabelle stand zusätzlich in `CalendarTab.tsx` (`getHouseOccupiedColor`)
und wurde beim Neubau der Monatsansicht ungeprüft übernommen — der Fehler
pflanzte sich fort.

**Warum es nicht hätte passieren dürfen:** Der echte Name war jederzeit prüfbar.
Zwei unabhängige Belege standen im selben Bildschirm:
1. Die Beschriftung zeigt „Venediger" — bei `name.replace(' Chalet','')` heißt
   der Name also „Venediger Chalet", nicht „Venedigersiedlung Chalet".
2. `getHouseIcon()` prüft auf `'siedlung'` und lieferte 🏠 statt 🏘️ — derselbe
   Namensfehler an zweiter Stelle.

Beides war sichtbar, wurde aber nicht gelesen, weil die Farbtabelle beim
Kopieren „plausibel aussah".

**Regel daraus (gilt über den Kalender hinaus):**
- **Nie Stammdaten-Namen als Schlüssel für Verhalten benutzen.** Hausnamen,
  Provider-Namen, Plattform-Namen ändern sich und werden unterschiedlich
  geschrieben. Wenn schon Namensabgleich, dann über Bestandteile
  (`name.toLowerCase().includes(…)`) und an **einer** Stelle.
- **Ein `default`-Zweig, der still etwas Harmloses liefert, ist ein Versteck.**
  Er verhindert den Absturz — und damit auch die Entdeckung. Bei Zuordnungen
  dieser Art gehört der Rückfall entweder ins Log oder er muss optisch
  auffallen.
- **Diese Lehre gehört zur bestehenden Regel „fehlendes Feld → zuerst die
  Datenquelle prüfen"** (`CODING-GUIDE.md` A1.3): Hier war es kein fehlendes
  Feld, sondern ein *nicht passender Schlüssel* — dasselbe Muster, dieselbe
  Prüfung hätte es gefunden.

### B) Zeilen ohne eigene Breite → Timeline auf schmalen Bildschirmen kaputt

Kopfzeile und Haus-Zeilen der Timeline hatten keine eigene Breite. Als
Block-Elemente in einem scrollbaren Bereich werden sie nur so breit wie der
**sichtbare** Bereich; der Inhalt (~2.600px bei 3 Monaten) quoll darüber hinaus.
Auf breiten Monitoren unauffällig, auf einem Surface brach damit sowohl die
feststehende Objekt-Spalte (`sticky left-0` ohne tragfähigen Bezugsrahmen) als
auch die Breitenberechnung des Scrollbereichs.
→ Behoben mit `w-max` auf Kopfzeile und Zeilen.
Zusätzlich lag um die Timeline ein **zweiter** `overflow-x-auto` in
`CalendarTab.tsx` — zwei verschachtelte Scroller stören sich. Entfernt.

### C) Feldnamen in der Detail-Anzeige falsch (Altbestand)

`CalendarTab.tsx` las `selectedEvent.cleaning.date` und
`selectedEvent.laundry.items.join(', ')`. Die echten Felder heißen
`scheduled_date` / `delivery_date` / `status`; **`items` ist ein Objekt**
(Mengen je Artikeltyp), kein Array. Ein Klick auf Reinigung/Wäsche zeigte
deshalb nie Datum oder Status — und `.join()` wäre abgestürzt, sobald die
Verknüpfung überhaupt gegriffen hätte. Behoben.

### D) Gelieferte Wäsche unsichtbar

Erster Entwurf filterte `status === 'delivered'` heraus. Damit verschwand jede
bereits gelieferte Bestellung aus dem Kalender — im Rückblick nicht mehr
prüfbar, ob rechtzeitig geliefert wurde. Jetzt wird sie grün angezeigt, wie
abgeschlossene Reinigungen.

### E) Icon am falschen Tag

> **⚠️ KORREKTUR 18.08.2026 — dieser Abschnitt beschreibt NICHT den heutigen
> Code.** Was hier steht, war der Stand am Vormittag des 27.07. Noch am selben
> Tag wurde die Zuordnung auf Vorgabe von Uli umgedreht: Reinigungs- und
> Wäsche-Icon sitzen im **ersten Kästchen der Buchung** (Anreisetag), zugeordnet
> über `booking_id` — auch in der Monatsansicht. Der echte Termin steht im
> Tooltip und im Popup. Nachzulesen im Code, `HouseStackedCalendar.tsx`:
> „ZUORDNUNG UEBER DIE BUCHUNG (27.07.2026, Vorgabe Uli)".
>
> Der Merksatz unten („dieselbe fachliche Zuordnung braucht je nach
> Darstellungsform eine andere technische Anknüpfung") bleibt trotzdem richtig
> und wurde bei den Portalen erneut gebraucht: eine Reinigung **ohne** Buchung
> (Fensterreinigung) hat keinen Anreisetag und kann nur auf ihrem echten
> `scheduled_date` sitzen. Siehe `docs/Session-2026-08-18-Belegungsraster-Portale.md`.


Erster Entwurf der Monatsansicht hängte die Icons an den Check-in-Tag der
Buchung (übernommen aus der Timeline). In der Timeline ist das richtig — ein
Balken hat keine Tagesspalte. In der Monatsansicht ist jede Zelle **ein** Tag,
und die Wäsche kommt typischerweise am **Vortag** der Anreise. Ergebnis: Icons
am falschen Tag oder gar nicht sichtbar.
→ **Merksatz:** Dieselbe fachliche Zuordnung braucht je nach Darstellungsform
eine andere technische Anknüpfung. Nicht blind zwischen Ansichten kopieren.

## 6. Bewusst NICHT geändert

- **Website-Kalender** (`AvailabilityCalendar.tsx`) — bleibt Gäste-Ansicht,
  ein Haus, keine internen Daten. Interne Daten dürfen dort nicht auftauchen.
- **Lücken-/Vermietbarkeits-Logik** — ursprünglich angefragt, vom eigentlichen
  Anliegen (Übersichtlichkeit) abgelöst, nicht umgesetzt.

## 7. Offen (abgestimmt, noch nicht gebaut)

**Kollisions-Markierung:** Wenn an einem Tag **beide** Häuser gleichzeitig
Reinigung, Wäschelieferung oder Check-in haben, den Tag farbig hervorheben
(Amela/Teuni können nicht zwei Häuser gleichzeitig bedienen). Mockup abgestimmt,
Umsetzung offen. Sinnvoll in **beiden** Ansichten, da die Spalten in beiden
Ansichten über die Häuser hinweg ausgerichtet sind.

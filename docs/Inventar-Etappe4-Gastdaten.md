# Inventar Etappe 4 — Gastdaten-Entdopplung

> **Zweck:** Vollständige Bestandsaufnahme aller Stellen, die noch aus den
> Kopiespalten `bookings.guest_*` lesen. Grundlage für den Umbau nach
> `docs/Konzept-Gastdaten-Entdopplung.md`, Etappe 4.
>
> **Methode:** Vollständiger Repo-Klon (`codeload` ZIP von `main`), lokales
> `grep` über alle 302 Frontend-Dateien und 39 Edge Functions. Nicht die
> GitHub-Code-Suche — die liefert nur begrenzte Treffer und hätte ein
> unvollständiges Bild ergeben.
>
> Stand: 13.08.2026 · Repo-Stand `main`

---

## 1. Ausgangslage nach Doku-Lektüre

Gelesen: `AGENTS.md`, `docs/PROJEKT-REGELN.md`, `docs/CODING-GUIDE.md`,
`docs/ARBEITSWEISE-CLAUDE-LESSONS.md` (Abschnitte 0–5 vollständig, 6–10
strukturell), `docs/CODE-INDEX.md` (Abschnitte 2b + 3 vollständig, übrige
strukturell), `docs/Konzept-Gastdaten-Entdopplung.md` (vollständig),
`src/lib/guestHelpers.ts`, `src/lib/guestKeyHelpers.ts`.

**Der Plan existiert bereits und ist präzise.** Etappe 2 (Umhängen verhindern)
und Etappe 3 (Datenhoheit umdrehen) sind seit 12.08.2026 live und verifiziert.
Wir stehen in **Etappe 4: die Leser umziehen**.

Verifiziert am Code, nicht aus der Doku übernommen:

| Prüfung | Befund |
|---|---|
| `GuestEditDialog` Rückschreibblock entfernt (Etappe 3b)? | ✅ ja — nur noch `guests`-Update, mit `.select()`-Prüfung nach Lesson 9.2 |
| `CreateBookingForm` setzt `guest_id`? | ✅ ja (Z. 621) |
| `useBookingInquiries` setzt `guest_id`? | ✅ ja (`saveOrUpdateGuest` → Z. 108) |
| `import-guest-list` setzt `guest_id`? | ❌ **nein** — kein einziges Vorkommen |
| `chat-assistant` setzt `guest_id`? | ❌ **nein** (`executeAcceptBookingInquiry`, Z. 100–116) |

Die letzten beiden bestätigen Abschnitt 2.1 des Konzepts und sind **Etappe 5**,
nicht Etappe 4.

---

## 2. Gesamtzahlen

Rohtreffer aller neun zu löschenden Spalten (ohne `guest_notes`, dort ist die
Entscheidung laut Konzept Punkt 9 noch offen):

| Bereich | Rohtreffer | nach Ausschlüssen |
|---|---|---|
| Frontend (`src/`) | 738 | 638 (ohne generierte `types.ts`) |
| Edge Functions | 208 | 174 |

**Rohtreffer sind nicht die Arbeitsmenge.** Nach Klassifikation nach
Zugriffsobjekt bleiben die echten Buchungs-Lesestellen:

| Kategorie | Anzahl | Betrifft Etappe 4? |
|---|---|---|
| **Frontend: echte `booking.guest_*`-Lesestellen** | **143** | ✅ ja |
| Frontend: `guest.*` (guests-Objekt, 89×) | 89 | ❌ nein — ist bereits die Quelle |
| Frontend: `inquiry.*` (`booking_inquiries`, 19×) | 19 | ❌ nein — Konzept 2.4 |
| Frontend: `formData`/`initialData`/`criteria` (lokaler State) | ~26 | ❌ nein |
| Frontend: `session.*` (Gäste-App-Tracking) | 7 | ❌ nein |
| **Edge Functions: echte Zugriffe** | **~174** | ✅ ja |
| davon Tool-Beschreibungen in `chat-assistant` (Prompt-Text) | 17 | ⚠️ Textpflege, kein Code |
| davon `max_actions`-Protokoll | 3 | ❌ nein — Konzept 2.4 |

Die Konzept-Schätzung „rund 450 Stellen" bestätigt sich als Rohzahl. Die
**tatsächliche Arbeitsmenge liegt bei rund 317 Codestellen** (143 Frontend +
174 Edge Functions) — deutlich weniger, aber immer noch zu viel für einen Schritt.

---

## 3. Frontend — 143 Lesestellen in 44 Dateien

Absteigend nach Umfang. Spalte „Join" = Query lädt `guests(...)` bereits mit.

| Datei | Stellen | Join | Einordnung |
|---|---|---|---|
| `Dashboard/GuestContactAlertBanner.tsx` | 17 | ❌ | **Priorität 1 — Logik-Bug** |
| `lib/guestHelpers.ts` | 9 | — | Der Fallback selbst; entfällt zuletzt |
| `Calendar/HouseStackedCalendar.tsx` | 9 | ❌ | Anzeige |
| `hooks/useRebookingScore.ts` | 7 | ✅ | gestern migriert, Reste |
| `Guests/GuestAnalytics.tsx` | 6 | ❌ | Auswertung |
| `Guests/AppReviewsSection.tsx` | 6 | ❌ | Anzeige |
| `Calendar/BookingTimeline.tsx` | 6 | ❌ | Anzeige (Tooltips) |
| `Bookings/BookingOverviewFixed.tsx` | 6 | ❌ | **Sortierung per `localeCompare`** |
| `hooks/useGuests.ts` | 5 | ✅ | gestern migriert, Reste |
| `Guests/GuestManagement.tsx` | 5 | ❌ | nutzt bereits `getGuestKey` |
| `Dashboard/CalendarTab.tsx` | 5 | ❌ | Anzeige |
| `Cleaning/EditCleaningTaskDialog.tsx` | 5 | ❌ | `task.bookings?.guest_email/phone` |
| `hooks/useGuestAppTracking.ts` | 4 | ❌ | Auswertung |
| `Bookings/CreateBookingForm.tsx` | 4 | ✅ | teilmigriert |
| `pages/OriginalDashboard.tsx` | 3 | ⚠️ | **Join da, ungenutzt** |
| `hooks/useOptimizedLinenManagement.ts` | 3 | ⚠️ | **Join da, ungenutzt** |
| `Settings/GuestImportCard.tsx` | 3 | ✅ | teilmigriert |
| `Dashboard/RealDataDashboard.tsx` | 3 | ❌ | Anzeige |
| 26 weitere Dateien mit je 1–2 Stellen | 42 | — | überwiegend reine Anzeige |

### 3.1 Halbfertige Migrationen — vier Dateien laden den Join, nutzen ihn nicht

Maschinell ermittelt (Join vorhanden, null Konsumstellen):

- `src/pages/OriginalDashboard.tsx`
- `src/hooks/useBookings.ts`
- `src/hooks/useDashboard.ts`
- `src/hooks/useOptimizedLinenManagement.ts`

Diese vier sind **die günstigste Arbeit im ganzen Vorhaben**: die Query ist
bereits erweitert, es fehlt nur die Konsumseite. Bei `useBookings.ts` und
`useDashboard.ts` ist die Wirkung überproportional, weil sie zentrale Hooks sind,
die viele Komponenten mit Buchungsdaten versorgen.

### 3.2 Priorität 1 — Logik statt Anzeige

Das Konzept nennt diese Kategorie ausdrücklich zuerst, weil es echte Fehler sind:

| Stelle | Problem |
|---|---|
| `GuestContactAlertBanner.tsx` Z. 68 | `if (!booking.guest_email)` sperrt den E-Mail-Knopf, obwohl in `guests.email` eine Adresse stehen kann. Der im Konzept benannte Bug — **verifiziert, existiert unverändert.** |
| `GuestContactAlertBanner.tsx` Z. 115, 158, 172 | Dieselbe Bedingung dreimal weiter unten für Anzeige und Telefon |
| `BookingOverviewFixed.tsx` Z. 366/368 | Sortierung per `guest_name.localeCompare` — sortiert nach der Kopie, nicht nach der Quelle |
| `CleaningManagement.tsx` Z. 164 | Suchfilter auf `booking.guest_name` |
| `OriginalDashboard.tsx` Z. 727 | Suchfilter auf `booking.guest_name` |
| `GuestManagement.tsx` Z. 50 | Fallback-Kette hinter `getGuestKey` — funktioniert, verlängert aber die Übergangsphase |

---

## 4. Edge Functions — ~174 Stellen in 18 Funktionen

| Funktion | Stellen | Join | Einordnung |
|---|---|---|---|
| **`chat-assistant`** | **111** | ❌ | Größter Einzelposten, eigener Schritt |
| `morning-summary` | 14 | ✅ | gestern migriert, Reste |
| `generate-guest-profile` | 10 | ✅ | **Priorität 1 — Logik** |
| `import-guest-list` | 8 | ❌ | **Schreibpfad → Etappe 5** |
| `kalender-abgleich` | 5 | ✅ | gestern migriert, Reste |
| `auto-create-linen-orders` | 5 | ✅ | Reste |
| `max-linen-reminders` | 4 | ❌ | |
| `overdue-watch` | 3 | ❌ | teils `max_actions` (ausgenommen) |
| `max-cleaning-reminders` | 3 | ❌ | |
| `ical-sync` | 3 | ✅ | gestern migriert, Reste |
| `generate-booking-linen-order` | 3 | ✅ | gestern migriert, Reste |
| `create-linen-order-for-booking` | 3 | ✅ | Reste |
| `check-booking-linen-orders` | 3 | ✅ | gestern migriert, Reste |
| `sync-linen-order-rest` | 2 | ❌ | |
| `generate-personalized-email` | 2 | ❌ | |
| `create-cleaning-task-for-booking` | 2 | ✅ | Reste |
| `analyze-vacancy` | 2 | ❌ | |
| `send-guest-email` | 1 | ❌ | |

### 4.1 Höchstes Regressionsrisiko: DB-seitige Filter

Diese elf Stellen filtern **in der Datenbank** auf einer Kopiespalte. Sie können
nicht mit dem Fallback-Muster `guests?.name || guest_name` umgestellt werden —
hier muss der Filter selbst auf die Relation umziehen:

| Datei : Zeile | Filter |
|---|---|
| `chat-assistant:59` | `.ilike('guest_name', …)` — `search_bookings` |
| `chat-assistant:241` | `.ilike('guest_name', …)` |
| `chat-assistant:355` | `.ilike('bookings.guest_name', …)` — **verschachtelt** |
| `chat-assistant:429/432/435` | `guest_name` / `guest_email` / `nationality` — `search_guests` |
| `chat-assistant:568` | `.ilike('bookings.guest_name', …)` — **verschachtelt** |
| `chat-assistant:612` | `get_booking_full_context` |
| `chat-assistant:1177` | `draft_guest_welcome_email` |
| `chat-assistant:2883` | `.eq('guest_name', …)` |
| `generate-guest-profile:59` | `.eq('guest_email', booking.guest_email)` |

**Die beiden verschachtelten Filter (Z. 355 und 568) sind der heikelste Punkt
des gesamten Umbaus.** Sie tragen im Code eine ausführliche Begründung: Beide
wurden am 14.07.2026 von fehlerhafter JS-Nachfilterung auf DB-Filterung
umgestellt, weil vorher alles ab Treffer 21 für Max unsichtbar war
(„Es gibt keine Reinigung für Luca" — obwohl sie existierte). Der Umbau bräuchte
einen dreistufigen Join `service_tasks → bookings → guests` mit einem Filter auf
`bookings.guests.name`. Ob PostgREST das in dieser Tiefe zuverlässig kann, ist
**ungeprüft** und muss isoliert getestet werden, bevor es angefasst wird.

`generate-guest-profile:59` ist zusätzlich ein Logik-Fall: Der Cache-Treffer
für ein Gästeprofil hängt an `guest_email` — bei 65 % leerer Spalte greift der
Cache dort nie oder falsch. Dasselbe Muster wie der Stammgast-Bug.

---

## 5. Was NICHT angefasst wird (verifiziert)

| Bereich | Stellen | Grund |
|---|---|---|
| `src/integrations/supabase/types.ts` | 100 | generiert, nie von Hand ändern (AGENTS.md) |
| `max_actions.guest_name` | 3 in EdgeFn + `MaxActionsPanel.tsx` (8) | eigene Protokollspalte, Momentaufnahme gewollt (Konzept 2.4) |
| `booking_inquiries.guest_*` | 19 Frontend + 6 EdgeFn | Eine Anfrage hat noch keinen Gast (Konzept 2.4) |
| `guest_contact_status` | — | buchungsbezogen, bleibt dauerhaft |
| `guests`-Tabellenfelder (`guest.name` …) | 89 | ist bereits die Quelle |
| `guest_notes` | 24 Frontend | Entscheidung offen (Konzept Punkt 9) |

---

## 6. Vorgeschlagene Reihenfolge

Nach Risiko gestaffelt, entsprechend Konzept Etappe 4:

**Schritt 1 — Die vier halbfertigen Dateien fertigstellen.**
`useBookings.ts`, `useDashboard.ts`, `OriginalDashboard.tsx`,
`useOptimizedLinenManagement.ts`. Der Join ist da, nur die Konsumseite fehlt.
Günstigster Nutzen, kein Query-Risiko, und zwei davon sind zentrale Hooks.

**Schritt 2 — Priorität-1-Logikstellen.**
`GuestContactAlertBanner.tsx` (der dokumentierte Bug),
`generate-guest-profile` (Cache an leerer Spalte),
`BookingOverviewFixed.tsx` (Sortierung), die beiden Suchfilter.
Hier wird nicht nur umgezogen, sondern echtes Fehlverhalten behoben.

**Schritt 3 — Edge Functions mit vorhandenem Join.**
Die neun Funktionen, die gestern schon einen Join bekommen haben: nur die
Restzugriffe nachziehen. Geringes Risiko, weil die Query bereits stimmt.

**Schritt 4 — `chat-assistant`, in sich gestaffelt.**
Erst die reinen Ausgabestellen, dann die einfachen `.ilike`-Filter, **zuletzt und
einzeln getestet** die beiden verschachtelten Filter (Z. 355, 568).

**Schritt 5 — reine Anzeigestellen** nach der Repo-Regel „beim nächsten
Anfassen mitkorrigieren".

**Nicht Teil von Etappe 4:** `import-guest-list` und `chat-assistant`
(`executeAcceptBookingInquiry`) müssen ihre `guest_id` selbst setzen — das ist
Etappe 5 und muss **vor** dem Löschen der Spalten stehen, weil der Link-Trigger
seine Eingabe aus genau diesen Kopiespalten bezieht.

---

## 7. Offener Punkt vor dem Start

`CalendarTab.tsx` und `BookingOverviewFixed.tsx` bekommen `bookingsData` bzw.
`filteredBookings` per Spread aus `OriginalDashboard.tsx` durchgereicht. Beim
Fertigstellen von Schritt 1 muss geprüft werden, ob dort Felder gelesen werden,
die der aufrufende Hook dann nicht mehr lädt — das ist genau die im CODE-INDEX
unter „Technische Fallen 1" beschriebene Falle (unvollständige Feldlisten bei
Joins, ohne Fehlermeldung).

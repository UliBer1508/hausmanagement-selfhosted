# Session 11.07.2026 — Übersichtskarten-Fixes + Max Erstell-Abläufe

> Zusammenfassung aller Änderungen dieser Session, mit Dateien, Grund, Status.
> Maßgeblich bleibt immer der Code im Repo. Diese Datei ersetzt Teil-Notizen
> (v. a. die frühere `AENDERUNG-Karten-Footer-und-Reinigung.md`, deren
> „graue Geändert-von-Zeile" hier durch die grüne Pille korrigiert ist).

---

## TEIL A — Übersichts-/verknüpfte Karten (Frontend)

Betrifft die drei Karten der **Übersicht (Tab 📊)** = zugleich `ConnectedBookingView`
(Buchungen-Tab): `BookingCard`, `ServiceTaskCard`, `LaundryOrderCard`.

### Behobene Probleme
- **a) Putzkraft folgte nicht dem Provider.** In `ServiceTaskCard.tsx` war „Amela"
  fester Fallback → jetzt Fallback = Provider-Name. In `EditCleaningTaskDialog.tsx`
  lud die Putzkraft-Liste anhand `task.provider_id` statt des im Formular gewählten
  Providers → jetzt `form.watch('provider_id')`, und beim Provider-Wechsel wird die
  Putzkraft auf „Keine Zuordnung" zurückgesetzt.
- **b) Provider „Boris" hervorheben.** In `ServiceTaskCard.tsx` bekommt „Boris" einen
  leicht roten Hintergrund (case-insensitive).
- **c) Überschneidung Datum/Putzkraft auf schmalen Karten.** Raster von `gap-x-6`
  auf `gap-x-4`, Zellen `min-w-0` + `truncate`, Label „Reinigungsdatum" → „Datum".
- **d) Falsches Änderungsdatum („Geändert von: Admin · 01.01.26").** Ursache war
  KEIN Zeitzonen-Bug: `status_changed_*` wurden nur bei Status-Wechsel geschrieben.
  Lösung: Anzeige nutzt `updated_at` (wird bei jeder Speicherung aktualisiert).

### Vereinheitlichung „Geändert von"-Zeile
- Neue gemeinsame Komponente `src/components/shared/ChangedByLine.tsx`.
- Optik (final, KORRIGIERT ggü. erster Fassung): **grün hinterlegte Pille**,
  Größe `text-xs`, Format `Geändert von: {Name} · {TT.MM.JJ HH:mm}`.
- In allen drei Karten eingebaut (Buchung: ersetzt „Aktualisiert:"; Wäsche: Datum
  ergänzt).

### Datenquelle
- `src/pages/OriginalDashboard.tsx`: Buchungs-Query der Übersicht um **`updated_at`**
  ergänzt (feste Spaltenliste, `updated_at` fehlte → Buchungskarte zeigte keine Zeile).

### Geänderte / neue Dateien (Teil A)
- `src/components/shared/ChangedByLine.tsx` (neu)
- `src/components/Bookings/ServiceTaskCard.tsx`
- `src/components/Bookings/BookingCard.tsx`
- `src/components/Bookings/LaundryOrderCard.tsx`
- `src/components/Cleaning/EditCleaningTaskDialog.tsx`
- `src/pages/OriginalDashboard.tsx`

**Status Teil A:** committet, via Vercel deployt, live geprüft. ✅
Keine DB-Migration nötig (nutzt vorhandenes `updated_at`).

---

## TEIL B — Max: Ablauf-Definitionstabelle

Ziel: „Fall → welche Funktion" verbindlich festhalten und als Prüf-Checkliste nutzen.

- Neue DB-Tabelle **`max_ablaeufe`** (Supabase), Spalten: `aktion, aktion_label,
  ausloeser, variante (standard | sonderfall_vorhanden | automatik), schritt_nr,
  akteur, schritt, ergebnis_status, karte, umsetzung, funktion, notiz`. RLS für
  eingeloggte Nutzer.
- Befüllt mit allen Abläufen (ein Datensatz pro Schritt): Reinigung erstellen
  (Standard + Sonderfall „schon vorhanden"), Reinigung ändern, Absage an Amela,
  Wäsche erstellen/anpassen, Buchungsanfrage annehmen/ablehnen, plus automatische
  Abläufe (Reminder Amela/Teuni, Wächter, Morgen-Übersicht, Überfällig-Wächter).
- Spalte `funktion` trägt je Fall das Tool / die Edge Function ein.

**Wichtige Klarstellung:** `max_ablaeufe` ist die **Soll-Vorgabe** (Doku in der DB).
Max' Verhalten steckt weiterhin im **Code je Tool** — Gemini kennt die Funktionen
über die **Tool-Definitionen** in `chat-assistant`. Die Tabelle „steuert" Max nicht
automatisch; sie ist Referenz und Checkliste. (Optionaler späterer Schritt: Tabelle
in den System-Prompt laden.)

### Dateien / SQL (Teil B)
- `max_ablaeufe.sql` (Tabelle + Befüllung)
- `max_ablaeufe_funktion.sql` (Spalte `funktion` + Zuordnung)

**Status Teil B:** SQL im Supabase-Editor ausgeführt. ✅

---

## TEIL C — Max: Erstell-Abläufe repariert (Edge Functions)

### Problem (bei Luca festgestellt)
- „erstelle Reinigung" legte den Entwurf an, zeigte aber **keine Karte** zum
  Bestätigen (Button nur bei `reschedule_cleaning` gebaut).
- „erstelle Wäsche" rief **die Batch-Automatik** `auto-create-linen-orders` auf
  (über alle Häuser, prüft „schon vorhanden") statt gezielt für die Buchung anzulegen.

### Lösung
1. **Neue Edge Function `create-linen-order-for-booking`** (Gegenstück zu
   `create-cleaning-task-for-booking`): legt gezielt EINE Bestellung für die
   gewählte Buchung an (Haus + Menge aus der Buchung via `generate-booking-linen-order`,
   Status `offen`, Teuni-Provider, Lieferdatum aus Settings). Gibt `linen_order_id`,
   `house_name`, `guest_name` zurück.
2. **`chat-assistant/index.ts`** (byte-genau editiert, Rest unverändert):
   - `executeCreateLinenForBooking` ruft jetzt `create-linen-order-for-booking`
     mit `{ booking_id }` (statt der Batch-Automatik).
   - `buildEntityLinks` erzeugt Buttons für `create_cleaning_for_booking`
     (→ `cleaning_task` / „Reinigung öffnen") und `create_linen_for_booking`
     (→ `laundry_order` / „Wäschebestellung öffnen"). Das Frontend
     (`ChatMessage.tsx`) unterstützt `laundry_order` bereits.
   - Protokoll-Wortlaut korrigiert.
3. **`create-cleaning-task-for-booking/index.ts` wiederhergestellt** — war beim
   Upload versehentlich mit Wäsche-Code überschrieben worden; jetzt wieder der
   Reinigungs-Code.

### Erstell-Ablauf (Soll, Option A — direkt anlegen + Karte)
Befehl → Max sucht Buchung → bei mehreren Auswahl → Max legt an (Reinigung `draft` /
Wäsche `offen`) → **Button zum Öffnen der Karte** → Uli prüft, setzt „Geplant" /
„Ausstehend" → fertig. Haus + Gästezahl kommen aus der Buchung.

### Dateien (Teil C)
- `supabase/functions/create-linen-order-for-booking/index.ts` (neu)
- `supabase/functions/chat-assistant/index.ts` (2 Funktions-Änderungen + Wortlaut)
- `supabase/functions/create-cleaning-task-for-booking/index.ts` (wiederhergestellt)

### Deploy-Status (Teil C)
- `create-linen-order-for-booking` — committet + **deployt** ✅
- `create-cleaning-task-for-booking` — committet (wiederhergestellt); Deploy
  empfohlen: `supabase functions deploy create-cleaning-task-for-booking --project-ref usblrulkcgucxtkhugck`
- `chat-assistant` — neue Version committet + auf GitHub verifiziert (vollständig).
  **OFFEN: deployen** → `git pull` + `supabase functions deploy chat-assistant --project-ref usblrulkcgucxtkhugck`

---

## Offene Punkte / nächste Schritte
1. `chat-assistant` deployen (letzter Schritt für Teil C), dann testen:
   „erstelle Reinigung/Wäsche für Luca" → Karte/Button erscheint.
2. In `max_ablaeufe` `umsetzung` für „Reinigung erstellen" und „Wäsche erstellen"
   nach erfolgreichem Test auf `umgesetzt` setzen.
3. Noch fehlende Abläufe (laut Tabelle): Sonderfall „Reinigung schon vorhanden →
   fragen", Absage an Amela (`reject_reschedule`), Überfällig-Wächter.
4. Optional: Wäsche-Karte auto-öffnen prüfen (`openOrderId` in `LinenDashboard`).

## Merksatz gegen Verwechslung
Ordnername = Thema: `create-cleaning-task-for-booking` → 🧹 Reinigung,
`create-linen-order-for-booking` → 📦 Wäsche. Steht im cleaning-Ordner 📦, ist es falsch.

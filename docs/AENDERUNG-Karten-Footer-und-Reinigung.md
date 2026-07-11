# Änderung: Karten-Footer vereinheitlicht + Reinigungskarte-Fixes

Datum: 11.07.2026 · Betroffen: Übersicht (OverviewTab-Karten)

## Behobene Probleme

**a) Putzkraft folgte nicht dem Provider-Wechsel.**
Zwei Ursachen:
- `ServiceTaskCard.tsx` hatte „Amela" als fest verdrahteten Fallback
  (`|| 'Amela'`). Jetzt: Fallback = Provider-Name (bei Provider Boris steht
  Boris), sonst „—".
- `EditCleaningTaskDialog.tsx` lud die Putzkraft-Liste anhand des
  gespeicherten `task.provider_id` statt des im Formular gewählten Providers.
  Deshalb erschien beim Wechsel auf Boris dessen Personal nicht. Jetzt hängt
  die Liste an `form.watch('provider_id')`; beim Provider-Wechsel wird die
  Putzkraft auf „Keine Zuordnung" zurückgesetzt.

**b) Provider „Boris" hervorheben.**
In `ServiceTaskCard.tsx` erhält der Provider-Name einen leicht roten
Hintergrund, wenn er „Boris" lautet (Vergleich case-insensitive). Leicht zu
erweitern, falls weitere Ersatz-Provider markiert werden sollen.

**c) Überschneidung von Datum und Putzkraft auf schmalen Karten.**
Standard-Raster beibehalten (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` wie in
`BookingCard`/`LaundryOrderCard`), aber `gap-x-6` → `gap-x-4`, jede Zelle
`min-w-0` + `truncate`, Label „Reinigungsdatum" → „Datum". Kein Überlappen mehr,
konsistent mit den Schwesterkarten.

**d) Falsches Änderungsdatum („Geändert von: Admin · 01.01.26").**
Ursache war KEIN Datums-/Zeitzonen-Bug. `status_changed_by` / `status_changed_at`
wurden nur bei Status-Wechsel geschrieben (`...(statusChanged ? {...} : {})`),
also blieb bei reinen Detail-Änderungen der alte Zeitstempel stehen.
Lösung ohne Eingriff in die Schreibpfade oder den Amela-Benachrichtigungs-
Trigger: die Anzeige nutzt jetzt `updated_at` (wird bei jeder Speicherung
aktualisiert) als Zeitpunkt, ersatzweise `status_changed_at`.

## Vereinheitlichung „Geändert von"-Zeile

Neue gemeinsame Komponente `src/components/shared/ChangedByLine.tsx` rendert in
allen drei Karten (Buchung, Reinigung, Wäsche) dieselbe Zeile mit identischer
Schrift und Größe (`text-[11px] text-muted-foreground`):
`Geändert von: {Name} · {TT.MM.JJ HH:mm}`.

- Buchungskarte: „Aktualisiert: …" ersetzt durch die einheitliche Zeile.
- Wäschekarte: „Geändert von: Admin" bekommt jetzt das Datum; gleiche Größe
  wie „Erstellt von".
- Reinigungskarte: Footer auf die gemeinsame Komponente umgestellt.

## Geänderte / neue Dateien
- `src/components/shared/ChangedByLine.tsx` (NEU)
- `src/components/Bookings/ServiceTaskCard.tsx`
- `src/components/Cleaning/EditCleaningTaskDialog.tsx`
- `src/components/Bookings/BookingCard.tsx`
- `src/components/Bookings/LaundryOrderCard.tsx`

## Datenbank
Keine Migration nötig. Die Anzeige stützt sich auf das vorhandene
`updated_at`. Voraussetzung: `updated_at` wird bei Änderungen an `bookings`,
`service_tasks` und `linen_orders` aktualisiert (im Reinigungs-Dialog explizit
gesetzt; bei Buchung/Wäsche via bestehendem Speicherpfad/Trigger).

## CODE-INDEX-Pflege (Pflicht laut AGENTS.md / CODING-GUIDE Teil A4)
Abschnitt 14 „UI-Bausteine → Geteilte App-Bausteine (`components/shared/*`)"
um `ChangedByLine` ergänzen:
> `ChangedByLine` — einheitliche „Geändert von: {Name} · {Datum}"-Fußzeile für
> Buchungs-, Reinigungs- und Wäschekarte.

## Geltungsbereich (wichtig)
- Diese drei Karten sind die Karten der **Übersicht (Tab 📊)** und zugleich der
  **verknüpften Ansicht** (`ConnectedBookingView` im Buchungen-Tab) — eine Datei
  pro Typ, daher wirken die Fixes an beiden Orten.
- NICHT enthalten (eigene Doppelgänger-Dateien, bei Bedarf separat nachziehen):
  Reinigung-Tab `Cleaning/CleaningManagement.tsx` (breite Inline-Karte) und die
  Dashboard-Kacheln `Operations/CleaningsCard.tsx` / `Operations/LinenDeliveriesCard.tsx`.
- Der Putzkraft-folgt-Provider-Fix (`EditCleaningTaskDialog.tsx`) wirkt überall,
  da Übersicht und Reinigung-Tab denselben Dialog nutzen.

## Changelog (Part-C-Format)

```
Übersicht/Karten: Footer vereinheitlicht + Reinigungskarte-Fixes

- Dateien: components/shared/ChangedByLine.tsx (neu),
  Bookings/ServiceTaskCard.tsx, Cleaning/EditCleaningTaskDialog.tsx,
  Bookings/BookingCard.tsx, Bookings/LaundryOrderCard.tsx
- Grund: Putzkraft folgte nicht dem Provider (a); Boris nicht hervorgehoben (b);
  Datum/Putzkraft überlappten schmal (c); "Geändert von" zeigte altes Datum (d);
  "Geändert von"-Zeile in den 3 Karten uneinheitlich (Größe/Datum)
- Daten: service_tasks.status_changed_by/updated_at, service_providers.name,
  cleaning_assignments; Putzkraft-Query in EditCleaningTaskDialog an
  form.watch('provider_id') statt task.provider_id gebunden
- Doku: CODE-INDEX.md §14 (ChangedByLine) ergänzen; diese Notiz in docs/
- Build: lokal nicht ausführbar (nur Datei-Lieferung); TypeScript/Imports geprüft
```

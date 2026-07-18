# Konzept: iCal-Sync mit Kollisionswarnung

**Stand:** 17.07.2026 · Status: Konzept (noch kein Code)
**Ziel:** Externe Plattform-Belegungen (Airbnb, Booking.com, VRBO, Belvilla) per
iCal-Feed einlesen und Uli warnen, wenn ein belegter Zeitraum mit einer bestehenden
Buchung im eigenen System kollidiert — um Doppelbuchungen zu verhindern.

---

## 1. Das Problem (aus der Praxis)

- Plattform-iCal-Feeds liefern **nur Belegt-Zeiträume, keine Gastdaten** (Name,
  Anzahl, Kontakt fehlen — das ist eine Grenze der Plattformen, nicht behebbar).
- **Doppelbuchungsgefahr:** Jemand bucht auf Booking.com, Uli wird nicht/zu spät
  informiert. Parallel fragt jemand direkt an, Uli sagt zu — ohne zu wissen, dass
  der Zeitraum schon weg ist. Kollision.

**Gewünschte Lösung (bewusst schlank):**
- Nur **Kollisionswarnung** — keine automatische Gastanlage, keine Buchungserstellung.
- Meldung in der **Morgen-Übersicht** (gebündelt) — UND bei einer Kollision
  **sofort/proaktiv** beim nächsten Chat-Öffnen.

---

## 2. Was schon da ist (darauf bauen wir auf)

- **Plattform-Liste existiert** (`CreateBookingForm.tsx`, Feld `platform`):
  `booking.com`, `airbnb`, `vrbo`, `belvilla`, `direct`, `other`. Dieselben Werte
  nutzt der Sync — kein neues Vokabular.
- **Spalte `bookings.import_platform`** existiert bereits in der DB (types.ts),
  wird aber im Frontend nicht genutzt — mutmaßlich Überrest eines früheren
  Import-Ansatzes. Kann als Herkunfts-Kennzeichen wiederverwendet werden.
- **Wächter-Muster existiert:** `check_upcoming_bookings` + `morning-summary`
  melden bereits fehlende Reinigung/Wäsche/Zahlung. Die Kollisionswarnung ist eine
  **weitere Prüfung im selben, vertrauten Muster** — kein Fremdkörper.
- **Cron-Infrastruktur** (pg_cron) läuft bereits für andere Automatiken.

---

## 3. Was die Portale hergeben (recherchiert 17.07.2026)

| Plattform | iCal Import | iCal Export | Hinweis |
|---|---|---|---|
| **Airbnb** | ✅ | ✅ | Export bis 365 Tage voraus, Import bis 2 Jahre; je Listing eigene URL |
| **Booking.com** | ✅ | ✅ | Export-URL im Extranet (Connectivity/Kalender) |
| **VRBO** | ✅ | ✅ | max. 5 Import-Kalender/Objekt; nur ohne Drittanbieter-PMS |
| **Belvilla** | ✅ | ✅ | **unterstützt iCal doch** (My-Belvilla-Konto). Ulis Annahme „kein iCal" war nicht korrekt — Feed-URL dort suchen. |

**Dein System = Master-Kalender.** Da die Portale untereinander verbunden sind, aber
nicht mit dir, schließt dein System die Lücke: Es importiert alle Portale (Kollisionen
sehen) und exportiert deine Direktbuchungen an alle Portale (damit die sie blocken).

### ⚠️ Endlosschleifen-Regel (kritisch — aus der Recherche)

Ein importierter iCal-Link darf **nur** Buchungen *dieser* Plattform enthalten. Der
**Export-Feed deines Systems darf ausschließlich die `direct`-Buchungen ausgeben** —
NIEMALS die per iCal reimportierten Fremd-Blocks. Sonst schaukeln sich die Plattformen
gegenseitig hoch (Update-Endlosschleife). Master-Kalender geben nur die *eigenen*
Buchungen aus.

### Ehrliche Grenze: Sicherheitsnetz, kein Echtzeit-Schutz

iCal ist pull-basiert und nur Verfügbarkeit — die Plattformen holen Updates nach
eigenem Zeitplan (teils nur alle paar Stunden). Eine frische Plattform-Buchung
erscheint bei uns also mit Verzögerung. Die Kollisionswarnung reduziert das Risiko
stark, eliminiert es aber nicht. Bei knappen Direktzusagen weiterhin kurz direkt prüfen.

### Zwei Richtungen (beide nötig)

- **Import (Plattform → mein System):** Portal-Export-URL abonnieren, Belegungen lesen.
- **Export (mein System → Plattform):** eigener iCal-Feed (nur `direct`-Buchungen),
  den Uli bei Airbnb/Booking/VRBO/Belvilla als externen Kalender einträgt.

---

## 4. Vorgeschlagene Architektur

### 4.1 Datenmodell (neue Tabellen)

**`ical_feeds`** — je Haus + Plattform eine Import-URL:
```
id, house_id, platform (booking.com/airbnb/vrbo/belvilla),
feed_url (die Export-URL der Plattform), is_active,
last_synced_at, last_status, created_at
```

**`external_blocks`** — die eingelesenen Belegungen (nur Zeiträume):
```
id, house_id, platform, external_uid (die UID aus dem VEVENT, für Dedupe),
start_date, end_date, summary (roher Text, z.B. "CLOSED - Not available"),
first_seen_at, last_seen_at, collision_booking_id (NULL, oder die kollidierende Buchung)
```

### 4.2 Import-Function `ical-sync` (Cron)

1. Alle aktiven `ical_feeds` durchgehen, Feed per HTTP abrufen.
2. iCal parsen: nur `VEVENT`-Blöcke → `DTSTART`/`DTEND` → Zeiträume.
   (Kein Gastname erwartet — Plattform-Grenze.)
3. Pro Belegung in `external_blocks` **upserten** (über `external_uid`, damit
   dieselbe Belegung nicht doppelt entsteht).
4. **Kollisionsprüfung:** Für jede (neue oder geänderte) externe Belegung prüfen,
   ob ein Datumsüberlapp mit einer bestehenden `bookings`-Zeile desselben Hauses
   besteht (Status nicht `cancelled`). Überlappungsregel:
   `block.start < booking.check_out AND block.end > booking.check_in`.
5. Bei Kollision: `collision_booking_id` setzen → das ist das Signal für die Meldung.

### 4.3 Export-Feed `ical-export` (öffentliche, tokengeschützte URL)

- Liefert **NUR die `platform = 'direct'`-Buchungen** eines Hauses als iCal
  (`VEVENT` je Buchung, nur Zeitraum, kein Gastname → Datenschutz gegenüber der
  Plattform). **Reimportierte Fremd-Blocks NIEMALS mit ausgeben** (Endlosschleife,
  siehe §3).
- Pro Haus eine schwer-rätbare Token-URL (wie `portal_token` bei Providern),
  die Uli bei Airbnb/Booking/VRBO/Belvilla als externen Kalender einträgt.

### 4.4 Meldung an Uli (drei Wege, gemäß Ulis Vorgaben)

- **Morgen-Übersicht** (`morning-summary`): Abschnitt „⚠️ Kalender-Kollisionen"
  ganz oben, analog zu überfälligen Vorgängen. Listet: Plattform, Zeitraum, Haus,
  kollidierende eigene Buchung.
- **Sofort/proaktiv im Chat:** Findet der Sync eine **neue** Kollision, wird sie so
  hinterlegt, dass sie beim nächsten Chat-Öffnen aktiv gemeldet wird (gleicher
  Auto-Insert-Mechanismus wie bei überfälligen Vorgängen in `ChatAssistant.tsx`).
- **E-Mail bei Kollision** (von Uli gewünscht): sofort bei einer NEUEN Kollision
  eine E-Mail an **max.steinbock@gmail.com** über `send-guest-email`
  (denomailer/Gmail-SMTP). Betreff z.B. „⚠️ Kalender-Kollision: <Plattform>
  <Zeitraum> <Haus>". Nur bei neu erkannten Kollisionen, nicht täglich wiederholen.

### 4.5 UI (minimal)

- **Haus-Einstellungen:** je Plattform ein Feld für die iCal-Import-URL +
  Anzeige der eigenen Export-URL zum Kopieren.
- **Kalender/Timeline:** externe Blocks als graue Balken (optional, Phase 2 —
  laut Uli reicht zunächst die Warnung).

---

## 5. Bewusste Grenzen (kein Scope Creep)

- **Keine** automatische Gast-/Buchungsanlage aus iCal (Daten fehlen ohnehin).
- **Keine** Preis-/Zahlungslogik.
- iCal-Feeds sind teils **verzögert** (Booking/Airbnb aktualisieren im
  Stunden-Takt) — die Warnung ist ein Sicherheitsnetz, kein Echtzeit-Schutz.
  Das ehrlich kommunizieren.

---

## 6. Umsetzungs-Phasen

**Phase 1 — Import + Kollisionswarnung (der Kern):**
1. Tabellen `ical_feeds`, `external_blocks` (SQL-Migration, versioniert im Repo).
2. Edge Function `ical-sync` (Parser + Kollisionsprüfung).
3. Cron dafür — **diesmal als SQL-Migration ins Repo**, nicht nur in der DB.
4. `morning-summary` um den Kollisions-Abschnitt erweitern.
5. Proaktive Chat-Meldung bei neuer Kollision.
6. Minimale UI zum Eintragen der Feed-URLs.

**Phase 2 — Export-Feed (damit Plattformen meine Buchungen kennen):**
1. Edge Function `ical-export` (tokengeschützt, pro Haus).
2. UI zeigt die Export-URL zum Kopieren.
3. Uli trägt sie bei den Plattformen ein.

**Phase 3 (optional) — externe Blocks im Kalender sichtbar machen.**

---

## 7. Von Uli bereits entschieden

- **Kein Channel-Manager.** Uli verbindet die Portale nicht untereinander mit sich;
  das eigene System wird der Master-Kalender. ✔
- **Sync 1× täglich** — mit der Morgen-Automatik. ✔
- **E-Mail bei Kollision** an **max.steinbock@gmail.com** (zusätzlich zu Chat +
  Morgen-Übersicht). ✔
- **Import UND Export** beide gewünscht (Phase 1 + Phase 2). ✔

## 8. Noch zu klären (kleiner)

1. **Belvilla-Feed:** Uli dachte, Belvilla könne kein iCal — laut Recherche doch.
   Uli prüft im „My Belvilla"-Konto, ob die iCal-Export-URL auffindbar ist. Falls
   dort wirklich keine da ist, läuft Belvilla eben nur über die anderen Kanäle mit.
2. **Feed-URLs sammeln:** Pro Haus + Plattform die Export-URL aus dem jeweiligen
   Portal kopieren (Airbnb: Verfügbarkeit → Kalender synchronisieren → Kalender
   exportieren; Booking: Extranet → Kalender/Connectivity; VRBO: Owner Dashboard →
   Kalender → Verbinden → Exportieren). Diese trägt Uli später in der neuen UI ein.
3. **Reihenfolge:** Vorschlag — Phase 1 (Import + Warnung) zuerst live, dann Phase 2
   (Export-Feed). So hast du den Doppelbuchungs-Schutz schnell, der Export folgt.

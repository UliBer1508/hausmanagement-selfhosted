# Etappe 4 — Bestandsaufnahme der Abfragen

> Arbeitsdokument zu `docs/Konzept-Gastdaten-Entdopplung.md`, Etappe 4.
> Hält fest, welche Supabase-Abfragen Gastdaten aus den Kopiespalten laden und
> welche bereits auf die `guests`-Relation umgestellt sind.
>
> Stand: 13.08.2026 (Abend) · **43 von 58 Abfragen tragen den Join**
> Tagesbericht mit allen Belegen und offenen Punkten:
> `docs/Session-2026-08-13-Gastdaten-Etappe4-und-5.md`

---

## 1. Die Einheit ist die Abfrage, nicht die Anzeigezeile

Die naheliegende Zählung — „wie viele Codezeilen lesen `booking.guest_name`?" —
führt in die Irre. Sie ergibt rund 317 Stellen und lässt die Aufgabe siebenmal
größer aussehen, als sie ist.

Wird direkt nach der Abfrage einmal gemappt, tragen alle nachgelagerten
Anzeigezeilen automatisch den richtigen Wert:

```ts
guest_name: (b as any).guests?.name || b.guest_name
```

Eine Abfrage mit fünfzehn Anzeigestellen braucht damit **zwei** Eingriffe, nicht
sechzehn. Nach diesem Muster wird durchgängig gearbeitet.

Für Etappe 6 zählt dieselbe Einheit: Beim Löschen der Spalten muss der Rückfall
`|| b.guest_name` aus den 45 Mappings verschwinden — nicht aus 317
Anzeigezeilen.

## 2. Das Umstellungsmuster

Zwei Eingriffe je Abfrage:

1. **Relation mitladen**, nur die gebrauchten Felder:
   `guests!bookings_guest_id_fkey(name, email, phone, nationality)`
2. **Einmal mappen**, dort wo das Ergebnis in ein eigenes Objekt überführt oder
   zurückgegeben wird.

**Sonderfall Filter:** Wird in der Datenbank auf einem Gastfeld gefiltert
(`.ilike('guest_name', …)`), muss der Filter selbst umziehen
(`.ilike('guests.name', …)`), und die Relation braucht `!inner`. Unbedenklich,
solange jede Buchung eine `guest_id` hat (Stand: 123 von 123).

**Sonderfall `select('*')`:** Hier steht in der Abfrage nicht, welches Feld
gebraucht wird. Jeder Konsument ist einzeln zu prüfen — deshalb eigener Block.

## 3. Belegt am 13.08.2026: PostgREST kann zwei Relationsebenen

Der Filter `.ilike('bookings.guests.name', …)` über
`service_tasks → bookings → guests` funktioniert, wenn **beide** Relationen
`!inner` tragen. Verifiziert an `search_cleaning_tasks` und
`search_linen_orders` mit unverändertem Vorher-/Nachher-Ergebnis.

Das war die einzige echte Unbekannte des Umbaus. Sie ist ausgeräumt.

---

## 4. Blöcke und Stand

| Block | Inhalt | Abfragen | Status |
|---|---|---|---|
| 1 | Edge Functions ohne `chat-assistant` | 7 | ✅ live 12.08. |
| 2 | Frontend | 14 | ✅ live 12.08. (5 Reste) |
| 3 | `chat-assistant`, explizite Feldlisten | 10 | ✅ live 13.08., getestet |
| 4a | verschachtelte **Filter** | 2 | ✅ live 13.08., getestet |
| 4b | verschachtelte **Anzeige** | 8 | ✅ live 13.08., getestet |
| 5 | `select('*')` einzeln prüfen | 11 | ⬜ offen |
| — | Restarbeiten aus Block 2 | 5 | ⬜ offen |

### Block 1 — 12.08.2026

`check-booking-linen-orders` (Z. 60), `generate-booking-linen-order` (Z. 26),
`ical-sync` (Z. 187), `kalender-abgleich` (Z. 290, 430),
`morning-summary` (Z. 200, 239).

**Nachweis:** Morgen-Übersicht vor und nach dem Deploy verglichen — alle
Abschnitte zeichengleich, Gastnamen unverändert.

### Block 2 — 12.08.2026

`useGuests` (3), `useRebookingScore` (2), `useMarketingActions` (2),
`useOperationsDashboard` (2), `useGuestStayCounts`, `useRatingReminders`,
`useBookingLinenOrders`, `OriginalDashboard`, `CreateBookingForm`.

**Fünf Stellen vollständig erledigt statt überbrückt:** In `useGuests` (2×),
`useMarketingActions` (2×) und `CreateBookingForm` wurde `guest_name`
angefordert, aber nie gelesen — dort ersatzlos aus der `select`-Liste entfernt.
Diese Abfragen brauchen in Etappe 6 keine weitere Änderung.

**Zusätzlich behoben, derselbe Fehler wie der Stammgast-Bug:**
`useRebookingScore` bildete den Gastschlüssel aus `guest_name|guest_email`. Bei
65 % leerer E-Mail bekam derselbe Gast zwei Schlüssel — ein Gast mit bereits
gebuchtem Folgeaufenthalt wäre erneut angeschrieben worden. Umgestellt auf
`guest_id`.

### Block 3 — 13.08.2026, getestet

Zehn Abfragen in `chat-assistant`, 106 Diff-Zeilen:
`executeSearchGuests`, Tages- und Wochenübersicht (je Check-in/Check-out),
Gästekontakt-Erinnerungen, Bewertungs-Erinnerungen, Begrüßungs-E-Mail (zwei
Abfragen), Vorschau kommender Buchungen.

**Zwei Stellen brauchten mehr als das Standardmuster:**

*Die Gästesuche* filterte über `guest_name`, `guest_email` und `nationality` —
wer dort suchte, durchsuchte die Kopien. Die Filter laufen jetzt gegen die
Relation.

*Die Begrüßungs-E-Mail* las den Namen an sechs Stellen. Statt sechs
Einzelkorrekturen wurden zwei Variablen (`gastName`, `gastEmail`) direkt nach
der Buchungsermittlung eingeführt. In Etappe 6 bleibt dort **eine** Stelle zu
ändern statt sechs.

**Nebenbefund, mit korrigiert:** `has_email` in den Gästekontakt-Erinnerungen
wurde aus `booking.guest_email` gebildet. Steht die Adresse nur in
`guests.email`, meldete Max fälschlich „keine E-Mail hinterlegt". Dasselbe
Muster wie `GuestContactAlertBanner.tsx` Z. 68 — dort noch offen.

**Nachweis:** „Bereite die Begrüßungs-E-Mail für Luca vor" → Entwurf mit
korrekter Adresse und Anrede im Vorschaufenster. „Lucas Mobus" korrekt als
Treffer **ohne** E-Mail gekennzeichnet.

### Block 4a — 13.08.2026, getestet

Die zwei Filter über zwei Relationsebenen: `search_cleaning_tasks` (Z. 355) und
`search_linen_orders` (Z. 568). Beide waren am 14.07.2026 von fehlerhafter
JS-Nachfilterung auf DB-Filterung umgebaut worden, weil vorher alles ab Treffer
21 unsichtbar war. Deshalb bewusst als eigener, kleiner Schritt (35 Diff-Zeilen)
mit Vorher-Wert und dokumentiertem Rückbau im Code.

**Nachweis:** „Welche Reinigungen gibt es für Luca?" liefert vor und nach der
Änderung identisch: 1 Reinigung, Venediger Chalet, 16.08.2026, 10:00, Boris,
storniert. Ebenso die Wäschebestellung.

### Block 4b — 13.08.2026, getestet

Acht verschachtelte Anzeige-Abfragen und zehn Lesestellen, 67 Diff-Zeilen.
Darunter zwei Bereiche über die reine Anzeige hinaus:

- **Provider-Ketten** (Reschedule-Abläufe zu Amela/Boris/Teuni): Der Gastname
  steht in den Nachrichten an die Dienstleister.
- **Schnellzugriff-Buttons** (`buildEntityLinks`): Beschriftung „Reinigung
  Luca", „Wäsche Luca".

**Nachweis:** Button-Beschriftung trägt weiterhin den Gastnamen.
**Nicht getestet:** die Provider-Ketten — sie brauchen einen echten Vorgang.
Der Code folgt dem Muster der geprüften Stellen, ist aber nicht beobachtet.

### Block 5 — offen: elf `select('*')`-Abfragen

`GuestAnalytics.tsx:620`, `GuestManagement.tsx:30`, `LinenDashboard.tsx:119`,
`LinenOrderAnalytics.tsx:84`, `OriginalDashboard.tsx:343`,
`analyze-vacancy:58`, `chat-assistant:232/485/605`, `morning-summary:295`,
`optimize-linen-inventory:56`.

Dazu `useBookings.ts` und `useDashboard.ts`: Beide laden bereits
`select('*, guests!bookings_guest_id_fkey(*)')` — die Query ist fertig, die
Konsumseite fehlt. Da beide zentrale Hooks sind und ihre Rohobjekte per Spread
weitergereicht werden, sind die empfangenden Komponenten mitzuprüfen
(CODE-INDEX, „Technische Fallen 1": unvollständige Feldlisten bei Joins
schlagen ohne Fehlermeldung durch).

### Restarbeiten aus Block 2 — offen

| Datei : Zeile | Zu tun |
|---|---|
| `useGuests.ts:26` | `nationality` geladen, aber Z. 71 liest `guest.nationality` → ersatzlos streichen |
| `useGuests.ts:324` | Join vorhanden, aber ohne `nationality`; Z. 373 liest `booking.nationality` → Join erweitern |
| `useMarketingActions.ts:189, 261` | Z. 166 **filtert** auf `booking.nationality` — Logik-Stelle |
| `useGuestStayCounts.ts:23` | nutzt `getGuestKey` (guest_id zuerst) → funktional korrekt, Felder erst in Etappe 6 streichen |
| `useRebookingScore.ts:72` | nutzt bereits `guest_id` → nur Feldliste bereinigen |

---

## 5. Bekannte Logik-Fehler in den Kopien (Priorität)

Keine Anzeigefehler, sondern falsches Verhalten:

| Stelle | Problem | Stand |
|---|---|---|
| `chat-assistant` `has_email` | Knopf-Sperre an leerer Kopie | ✅ behoben 13.08. |
| `GuestContactAlertBanner.tsx:68` | sperrt E-Mail-Knopf, obwohl `guests.email` gefüllt | ⬜ offen |
| `generate-guest-profile:59` | Profil-Cache über `.eq('guest_email', …)` | ⬜ offen |
| `BookingOverviewFixed.tsx:366/368` | Sortierung über die Kopie | ⬜ offen |

---

## 6. Was nach Etappe 4 noch fehlt

**Etappe 5, vor dem Löschen zwingend:** `import-guest-list` und
`chat-assistant` (`executeAcceptBookingInquiry`) setzen **keine** `guest_id` —
am 13.08.2026 im Code bestätigt. Sie funktionieren nur, weil
`trg_link_guest_on_booking_insert` sie nachholt, und dieser Trigger bezieht
seine Eingabe aus genau den Kopiespalten, die gelöscht werden sollen.

Vollständige Vorbedingungsliste für Etappe 6: `Konzept-Gastdaten-Entdopplung.md`,
Abschnitt 5c.

# Notiz-Schnellbearbeitung & kompakte Kartenansicht

Letzte Aktualisierung: 15.06.2026

> **Änderung 15.06.2026:** Buchungsinfos auf der Wäschekarte (Lieferschein in der
> Wäschebestellung) an die Reinigungskarte angeglichen. Siehe Abschnitt
> „Feld-Angleichung Wäschekarte ↔ Reinigungskarte" weiter unten.

## Zweck
Einheitliches Notiz-Icon und kompakte, mehrspaltige Darstellung auf den drei
wichtigsten Übersichtskarten:

- Reinigungskarte (Endreinigung)
- Wäschekarte (Lieferschein)
- Buchungskarte (Reservierung) — sowohl in der „Verknüpften Ansicht" als auch
  im Buchungs-Tab

## UI-Konzept

### Notiz-Icon im Kopfbalken
- Position: rechts neben dem Titel, direkt vor dem Status-Badge
- Icon: `StickyNote` (lucide-react), eingebettet in `bg-white/15`-Button (7×7)
- **Indikator-Dot**: Gelber Punkt (`bg-amber-300`) oben rechts, sobald eine
  Notiz im jeweiligen Datensatz vorhanden ist
- Klick öffnet `NotesQuickDialog` zum Anzeigen/Bearbeiten/Speichern

### Kompakte Datenraster
Statt einer vertikalen Liste werden Felder in einem responsiven Grid
(`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) nebeneinander dargestellt, um
Platz zu sparen, ohne Informationen zu verlieren.

## Komponenten

| Datei | Funktion |
|---|---|
| `src/components/shared/NotesQuickDialog.tsx` | Wiederverwendbarer Dialog (Textarea + Speichern/Abbrechen) |
| `src/components/Cleaning/CleaningManagement.tsx` | Reinigungskarte: Notiz-Icon + Kompakt-Grid, Update auf `service_tasks.notes` |
| `src/components/Bookings/ServiceTaskCard.tsx` | Reinigungs-Card-Variante in der Verknüpften Ansicht |
| `src/components/Bookings/LaundryOrderCard.tsx` | Wäschekarte: Notiz-Icon + Kompakt-Grid, Update auf `linen_orders.notes` |
| `src/components/Bookings/BookingCard.tsx` | Buchungskarte (Verknüpfte Ansicht): Notiz-Icon, Update auf `bookings.notes` |
| `src/components/Bookings/BookingOverviewFixed.tsx` | Buchungskarte im Buchungs-Tab: gleiches Icon + Dialog |

## Persistenz
- `service_tasks.notes` — bereits vorhanden
- `linen_orders.notes` — bereits vorhanden
- `bookings.notes` — bereits vorhanden

Keine Migration nötig. Nach jedem Speichern wird die zugehörige
React-Query-Cache invalidiert (`cleaning-tasks`, `linen-orders`, `bookings`,
`bookings-overview`).

## Feld-Angleichung Wäschekarte ↔ Reinigungskarte (15.06.2026)

### Problem
In der **Wäschebestellung** (Tab „Wäsche", Liste `LinenOrdersList.tsx`) zeigte
die Wäschekarte (`LaundryOrderCard.tsx`) deutlich weniger Buchungsinfos als die
Reinigungskarte in der Reinigungsverwaltung (`CleaningManagement.tsx`). Beide
Karten nutzen dasselbe Kompakt-Grid, aber die Wäschekarte gab nur `Gast`,
`Lieferdatum`, `Kosten` und `Artikel` aus.

**Fehlende Felder auf der Wäschekarte:**
- **Buchung** (Zeitraum `Check-in – Check-out`)
- **Personenzahl** beim Gast (z. B. „Dot Shaw (3)")
- optional: **Adresse** des Hauses (📍-Zeile wie bei der Reinigungskarte)

### Wichtig: Keine Datenbank- oder Query-Änderung nötig
Die Query in `LinenOrdersList.tsx` lädt die benötigten Felder bereits mit:

```ts
bookings (
  id, guest_name, guest_email,
  check_in, check_out, number_of_guests,
  guest_id, guests (*)
)
```

Die Werte stehen also im `order.bookings`-Objekt zur Verfügung und müssen nur in
der Karte ausgegeben werden. Es handelt sich um eine reine Anzeige-Ergänzung.

### Referenz-Layout (korrekt befüllt)
Die Reinigungskarte in `CleaningManagement.tsx` dient als Vorlage. Ihr
Kompakt-Grid enthält (in dieser Reihenfolge): 📍 Adresse, `Service` (Datum +
Uhrzeit), `Buchung` (`check_in – check_out`), `Gast` (Name + `(number_of_guests)`),
`Provider`, `Kosten`, `Bezahlung`, `Personal`.

### Umsetzung in `LaundryOrderCard.tsx`
Im Kompakt-Grid (Block „Compact fields grid", aktuell `Gast` / `Lieferdatum` /
`Kosten` / `Artikel`):

1. **Personenzahl an den Gastnamen anhängen** (nur wenn `order.bookings` vorhanden):
   ```tsx
   <div className="text-sm truncate">
     {guestName}
     {order.bookings?.number_of_guests != null && (
       <span className="text-muted-foreground"> ({order.bookings.number_of_guests})</span>
     )}
   </div>
   ```
2. **Neues Feld „Buchung"** (Zeitraum) ergänzen, analog zur Reinigungskarte:
   ```tsx
   {order.bookings?.check_in && order.bookings?.check_out && (
     <div>
       <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Buchung</div>
       <div className="text-sm truncate">
         {new Date(order.bookings.check_in).toLocaleDateString('de-DE')} – {new Date(order.bookings.check_out).toLocaleDateString('de-DE')}
       </div>
     </div>
   )}
   ```
3. **Optional — Adresse** (📍) oberhalb des Grids, wenn `order.houses?.address`
   vorhanden ist, wie bei der Reinigungskarte.

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `src/components/Bookings/LaundryOrderCard.tsx` | Grid um `Buchung` + Personenzahl (und optional Adresse) erweitern |
| `src/components/Houses/LinenOrdersList.tsx` | **keine** — lädt die Daten bereits |
| `src/components/Houses/BookingLinenOverview.tsx` | prüfen, ob `order.bookings` dort ebenfalls geladen wird (falls die Karte auch dort genutzt wird) |

### Hinweis zur Datenverfügbarkeit
`order.bookings` kann `null` sein (Wäschebestellung ohne verknüpfte Buchung,
z. B. manuell angelegte Bestellung). Alle neuen Felder daher konsequent mit
`order.bookings?.…` und Bedingungs-Rendering absichern, damit leere Karten nicht
brechen.

---

# Gäste-Kommunikationshistorie (Stufe 1)

## Zweck
Jede aus der App gesendete Gast-E-Mail wird gespeichert und pro Gast als
Verlauf angezeigt. Eingehende Antworten können manuell („Antwort notieren") als
Copy-Paste aus Gmail nachgetragen werden — Zwei-Wege-Historie ohne Gmail-API.

## Datenbank
Tabelle `guest_communications` mit:
- `guest_id`, `guest_email`, `guest_name`
- `direction` (`outbound` / `inbound`)
- `subject`, `body`, `occurred_at`
- RLS: Admin-Only (`has_role(auth.uid(), 'admin')`)

## Komponenten / Hooks
| Datei | Funktion |
|---|---|
| `src/hooks/useGuestCommunications.ts` | `useGuestCommunications`-Query + `logCommunication`-Helper |
| `src/components/Guests/GuestCommunicationHistory.tsx` | Verlauf-Anzeige pro Gast + Dialog „Antwort notieren" |
| `src/components/Guests/GuestCommunication.tsx` | Logging bei Segment-/Personalisierten Mailings |
| `src/components/Guests/GuestEmailDialog.tsx` | Logging beim Versand aus Gast-Dialog |
| `src/hooks/useRebookingScore.ts` | Logging bei Rebooking-Mails |
| `src/components/Guests/GuestDetailsDialog.tsx` | Bindet Verlauf am unteren Rand des Gast-Details ein |

## Hinweis Stufe 2 (später)
Automatisches Einlesen eingehender Gmail-Antworten erfordert Gmail-API
(OAuth + Edge Function). Nicht Teil von Stufe 1.

---

# E-Mail-Versand via Gmail-Web (Standard)

- `src/lib/mailtoHelper.ts` öffnet E-Mails standardmäßig in Gmail-Web mit
  festem Absender `steinbockchalets@gmail.com`. Betreff & Text bleiben erhalten.
- Outlook/lokaler Mail-Client bleibt als Option erhalten und ist über die
  Einstellungen (`SettingsTab.tsx`) umschaltbar.
- Komponenten wie `GuestContactAlertBanner.tsx` und `GuestEmailDialog.tsx`
  nutzen `buildGmailComposeHref` und profitieren automatisch.

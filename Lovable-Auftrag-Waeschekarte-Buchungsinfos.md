# Lovable-Auftrag: Buchungsinfos auf der Wäschekarte ergänzen

## Hintergrund
In der **Wäschebestellung** (Tab „Wäsche") zeigen die Karten (Lieferschein)
weniger Buchungsinfos als die Reinigungskarten in der Reinigungsverwaltung.
Es fehlen auf der Wäschekarte:
- **Buchung** (Zeitraum Check-in – Check-out)
- **Personenzahl** beim Gast (z. B. „Dot Shaw (3)")

> Wichtig: Es ist **keine** Datenbank- oder Query-Änderung nötig. Die Liste
> (`LinenOrdersList.tsx`) lädt `check_in`, `check_out` und `number_of_guests`
> bereits über die `bookings (...)`-Relation. Die Werte stehen in
> `order.bookings` zur Verfügung und müssen nur angezeigt werden.

Referenz-Layout ist die Reinigungskarte in
`src/components/Cleaning/CleaningManagement.tsx` (Felder: Service, **Buchung**,
**Gast + (Personenzahl)**, Provider, Kosten, Bezahlung, Personal).

## Datei `src/components/Bookings/LaundryOrderCard.tsx`

Im Block „Compact fields grid" (das responsive Raster mit `Gast`, `Lieferdatum`,
`Kosten`, `Artikel`) zwei Anpassungen vornehmen:

### 1. Personenzahl an den Gastnamen anhängen
Ersetze den bestehenden `Gast`-Block durch:

```tsx
{guestName && (
  <div>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gast</div>
    <div className="text-sm truncate">
      {guestName}
      {order.bookings?.number_of_guests != null && (
        <span className="text-muted-foreground"> ({order.bookings.number_of_guests})</span>
      )}
    </div>
  </div>
)}
```

### 2. Neues Feld „Buchung" (Zeitraum) ergänzen
Direkt nach dem `Gast`-Block einfügen (vor `Lieferdatum`):

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

### 3. Optional — Adresse (📍) wie bei der Reinigungskarte
Falls gewünscht, oberhalb des Grids (innerhalb `CardContent > div.space-y-2`)
ergänzen:

```tsx
{order.houses?.address && (
  <div className="flex items-start gap-2 text-xs text-muted-foreground">
    <span className="shrink-0">📍</span>
    <span className="break-words">{order.houses.address}</span>
  </div>
)}
```

## Hinweis zur Absicherung
`order.bookings` kann `null` sein (Wäschebestellung ohne verknüpfte Buchung).
Alle neuen Felder daher konsequent mit `order.bookings?.…` und
Bedingungs-Rendering verwenden, damit Karten ohne Buchung nicht brechen.

## Falls die Karte auch in `BookingLinenOverview.tsx` genutzt wird
Dort bitte prüfen, ob die `linen_orders`-Query ebenfalls die `bookings (...)`-
Relation mit `check_in, check_out, number_of_guests` lädt. Falls nicht, diese
Felder zur dortigen Query hinzufügen (gleiches Select wie in
`LinenOrdersList.tsx`).

## Abnahme
- In der Wäschebestellung zeigt jede Karte mit verknüpfter Buchung den
  Zeitraum (Check-in – Check-out) und beim Gast die Personenzahl in Klammern.
- Karten ohne Buchung werden weiterhin korrekt (ohne Buchungszeile) angezeigt.
- Das Layout entspricht optisch der Reinigungskarte.

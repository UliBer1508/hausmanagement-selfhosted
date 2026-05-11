## Ursache

Dasselbe React-Portal-Bubble-Problem wie bei `BookingCard`: Mehrere Karten machen die gesamte `Card` klickbar (öffnet einen Dialog) **und** der Dialog wird via Radix-Portal in `document.body` gerendert. React-Events bubblen aber durch den **React-Komponentenbaum**, nicht durch das DOM. Folge: Klick auf X / Backdrop / Cancel im Dialog → Dialog schließt → Click-Event bubbelt zurück zur Card → `setOpen(true)` → Dialog öffnet sofort wieder.

Betroffene Karten:
- `src/components/Bookings/ServiceTaskCard.tsx` → öffnet "Reinigungsauftrag bearbeiten" (das Symptom aus dem Screenshot, sichtbar in „Buchungen → Verknüpft")
- `src/components/Bookings/LaundryOrderCard.tsx` → öffnet "Wäschebestellung bearbeiten"
- `src/components/Houses/CompetitorAnalysis/CompetitorCard.tsx` → öffnet Konkurrenz-Details

`HouseCard.tsx` nutzt nur Button-Trigger und ist nicht betroffen. `BookingCard.tsx` wurde bereits im vorherigen Schritt gefixt.

## Lösung

In allen drei Karten denselben Schutz wie in `BookingCard` einbauen: Card-`onClick` und `onKeyDown` ignorieren Events, die nicht aus dem eigenen DOM-Subtree stammen (also Events aus geportalten Kindern wie Dialog/Select/Popover).

### Patch-Schema (pro Datei)

```tsx
onClick={(e) => {
  if (!e.currentTarget.contains(e.target as Node)) return;
  setOpen(true);            // jeweiliger Setter
}}
onKeyDown={(e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
    e.preventDefault();
    setOpen(true);
  }
}}
```

### Konkrete Änderungen

1. **`src/components/Bookings/ServiceTaskCard.tsx`** (Z. 73–79): `setShowEditDialog(true)` mit Guard.
2. **`src/components/Bookings/LaundryOrderCard.tsx`** (Z. 134–140): `handleCardClick` nur ausführen, wenn Event nicht aus Portal stammt.
3. **`src/components/Houses/CompetitorAnalysis/CompetitorCard.tsx`** (Z. 47): `setDetailsOpen(true)` mit Guard.

Keine weiteren Dateien betroffen. Edit-Buttons innerhalb der Karten haben bereits `stopPropagation` und bleiben unverändert.

## Akzeptanzkriterien

- "Reinigungsauftrag bearbeiten" – X-Button schließt zuverlässig (öffnet nicht erneut).
- "Wäschebestellung bearbeiten" – X-Button schließt zuverlässig.
- Konkurrenz-Detail-Dialog – X-Button schließt zuverlässig.
- Backdrop-Klick und ESC schließen ebenfalls.
- Selects/Popovers/AlertDialogs innerhalb der Dialoge schließen normal, ohne den darüberliegenden Dialog zu reöffnen.
- Karten-Klick öffnet den jeweiligen Dialog weiterhin wie gewohnt.

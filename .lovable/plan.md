## Ursache

`src/components/Bookings/BookingCard.tsx` macht die gesamte Karte klickbar:

```tsx
<Card onClick={() => setEditOpen(true)} ...>
```

Der Dialog "Buchung bearbeiten" wird via Radix-Portal in `document.body` gerendert, **React-Events bubblen aber durch den React-Komponentenbaum** (nicht durch das DOM). Das bedeutet: Klick auf das X im Dialog → Dialog schließt sich → derselbe Click-Event bubbelt durch den React-Tree hoch zur `Card` → `setEditOpen(true)` → Dialog öffnet sich sofort wieder.

Effekt für den User: Der X-Button "funktioniert nicht".

Genau dasselbe Problem würde bei jedem Klick im Dialog auftreten (Backdrop-Klick, Cancel-Button, etc.).

## Lösung

In `BookingCard.tsx` den `onClick`-Handler der Card so absichern, dass nur tatsächliche Klicks innerhalb des Card-DOM die Bearbeitung öffnen – Klicks aus geportalten Kindern (Dialog, Selects, Popovers, Toasts) werden ignoriert.

### Änderung in `src/components/Bookings/BookingCard.tsx`

```tsx
onClick={(e) => {
  // Klicks aus Portalen (Dialog, Select, Popover) ignorieren –
  // sonst öffnet der Dialog-Close das Edit-Fenster sofort wieder.
  if (!e.currentTarget.contains(e.target as Node)) return;
  setEditOpen(true);
}}
onKeyDown={(e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
    e.preventDefault();
    setEditOpen(true);
  }
}}
```

Keine weiteren Dateien betroffen. Edit-Button im Dialog (Trigger) hat bereits `stopPropagation` – bleibt unverändert.

## Akzeptanzkriterien

- Klick auf Karte "Helena Kunz" öffnet den Dialog "Buchung bearbeiten".
- Klick auf das X schließt den Dialog dauerhaft (öffnet nicht erneut).
- Klick außerhalb (Backdrop) und ESC schließen den Dialog ebenfalls.
- Selects/Popovers innerhalb des Formulars schließen normal, ohne den Dialog zu reöffnen.

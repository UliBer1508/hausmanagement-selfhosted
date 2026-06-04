## Problem

Der X-Close-Button im `EditCleaningTaskDialog` schließt den Dialog weiterhin nicht — auch nach dem Layout-Fix (Badge/Löschen in eigene Zeile).

## Vermutete Ursache

`EditCleaningTaskDialog` rendert **drei separate `<Dialog>`-Komponenten** abhängig vom Zustand:

```tsx
if (loadingTask) return <Dialog>...</Dialog>;   // Variante A
if (!task)       return <Dialog>...</Dialog>;   // Variante B
return            <Dialog>...</Dialog>;          // Variante C
```

Dadurch:

1. Radix Dialog wird **unmounted und remounted**, sobald `loadingTask` von `true` auf `false` wechselt.
2. Während des kurzen Übergangs (Loading → Daten geladen) bleibt der Portal-/Focus-Trap-/Scroll-Lock-Zustand inkonsistent (im Replay sieht man `body[data-scroll-locked]` + `pointer-events: none`).
3. Wenn der User währenddessen auf X klickt, feuert `onOpenChange(false)` zwar — aber die parallel ablaufende Re-Mount-Logik führt dazu, dass `open=true` für die neu gemountete Dialog-Instanz aktiv bleibt (Parent-State wurde durch Re-Mount überschrieben oder die Open-Property kommt vom Parent, der noch `true` hält).

## Lösung

`EditCleaningTaskDialog` so refaktorieren, dass **immer nur ein** `<Dialog open={open} onOpenChange={onOpenChange}>` gerendert wird. Innerhalb von `<DialogContent>` wird der Inhalt anhand des States bedingt gerendert (Loading-Spinner, „nicht gefunden"-Hinweis oder Formular).

```tsx
return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      {loadingTask ? (
        <div className="flex items-center justify-center py-8">Lädt...</div>
      ) : !task ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          Reinigungsauftrag nicht gefunden.
        </div>
      ) : (
        <>
          <DialogHeader>...</DialogHeader>
          ...restliches Formular...
        </>
      )}
    </DialogContent>
  </Dialog>
);
```

Damit:
- nur **eine** Dialog-Root mit stabilem Portal/Focus-Trap
- X-Close-Button verhält sich konsistent
- kein Flicker zwischen Loading- und Daten-Variante

## Verifikation

- Preview öffnen, einen Reinigungsauftrag-Edit-Dialog öffnen, X klicken → schließt sofort.
- Bei langsamem Netzwerk: während des Ladens auf X klicken → schließt sofort.
- ESC und Klick auf Overlay weiterhin funktional.

## Nicht im Umfang
- Keine Änderung an `dialog.tsx` oder an anderen Dialogen.
- Keine Logik-Änderung in den Mutations/Queries.

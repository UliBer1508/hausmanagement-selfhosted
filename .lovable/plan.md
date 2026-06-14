## Problem

Auf der Reinigungs-Seite (`CleaningManagement.tsx`) wirken die Reinigungskarten auf dem Handy enger als die Buchungskarten:

- Titel im Kopfbalken wird zu „Reinigungsa…" abgeschnitten (durch `truncate`), weil „Reinigungsauftrag" zu lang ist.
- Body nutzt ein dichtes Grid `grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5` — auf Mobile sind die Zeilen mit nur 6px Abstand gestapelt, ohne Label/Value-Trennung.
- Im Vergleich nutzt `BookingCard.tsx` `space-y-2` mit dezenten Labels (`text-xs text-muted-foreground` über dem Wert) und wirkt dadurch luftig.

## Lösung

Reinigungskarte in `CleaningManagement.tsx` (Zeilen ~595–687) auf das gleiche Layout-Muster wie `BookingCard.tsx` umstellen:

1. **Kopfbalken**: Titel von „Reinigungsauftrag" auf „Reinigung" verkürzen (passt ohne Truncate, analog zu „Reservierung").
2. **Body-Struktur**: `grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5` ersetzen durch denselben Aufbau wie BookingCard:
   - Äußerer Wrapper `space-y-2`
   - Datumspaar (Service / Buchung) als `grid grid-cols-2 gap-2 text-sm` mit Label oben (`text-muted-foreground text-xs`) und Wert darunter
   - Restliche Zeilen (Adresse, Gast, Gäste-Anzahl, Provider, Kosten, Bezahlung, Personal, Status-Change) jeweils als eigene `flex items-center gap-2 text-sm` Zeile
3. Auf Desktop (≥ md) optional zweispaltig belassen, aber Mobile bekommt klare, luftige Stapelung wie bei Buchungen.

## Technisch betroffene Datei

- `src/components/Cleaning/CleaningManagement.tsx` (nur der `cleaningTasks?.map(...)` Render-Block, ~Zeilen 588–688)

Keine Änderungen an Daten, Hooks oder anderen Komponenten.
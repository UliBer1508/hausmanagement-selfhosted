## Ziel
Stammgäste, die bereits wieder gebucht haben (z. B. Frau Erler kommt im Winter wieder), sollen nicht mehr als „at_risk" in der Rebooking-Kampagne erscheinen. Stattdessen werden sie ausgeschlossen und die Anzahl wird als kleiner Info-Hinweis angezeigt.

## Änderungen

### 1. `src/hooks/useRebookingScore.ts`
- Zweite Query: alle Buchungen mit `check_in >= heute` und Status `confirmed` / `checked_in` laden (nur `guest_name`, `guest_email`).
- Set der Gast-Keys (`name|email`) mit zukünftiger Buchung erstellen.
- Beim Aufbau der Gäste-Liste: Gäste in diesem Set überspringen.
- Return-Objekt erweitern: statt nur Array → `{ guests: GuestRebookingData[], alreadyRebookedCount: number }`.

### 2. `src/components/Guests/RebookingCampaign.tsx`
- Anpassung an neue Hook-Rückgabe (Destructuring).
- Kleiner Info-Banner über der Liste (nur wenn `alreadyRebookedCount > 0`):
  > „✓ X Stammgäste haben bereits wieder gebucht und werden hier nicht angezeigt."

## Nicht im Scope
- Keine Änderung am Score selbst (keine VIP-Bonus-Logik).
- Keine UI-/Design-Überarbeitung.

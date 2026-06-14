## Ziel
Im Tab "Kommunikation → Personalisierung" soll zusätzlich zu Segmenten (Alle/VIP/Stammgäste/Neu) ein **einzelner Gast** als Zielgruppe wählbar sein. Die KI generiert dann eine namentlich personalisierte Nachricht für genau diesen Gast.

## Änderungen (nur Frontend, eine Datei)
Datei: `src/components/Guests/GuestPersonalization.tsx`

1. **Neue Option im Zielgruppen-Select**: Eintrag `"Einzelner Gast"` (`value="single"`) zusätzlich zu den bestehenden Segmenten.
2. **Gast-Auswahl erscheint, wenn `selectedSegment === 'single'`**:
   - Searchable Combobox (shadcn `Command` + `Popover`) mit allen Gästen aus `segmentData.allGuests`, durchsuchbar nach Name/Email.
   - Zeigt Name + Email + Stay-Count + Gesamtumsatz pro Eintrag.
   - State: `selectedGuestKey: string | null`.
3. **`getFilteredGuests('single')`** gibt ein Array mit genau diesem einen Gast zurück (oder leer, wenn keiner gewählt).
4. **Beschreibung unter Select** zeigt bei `single` z. B. „Nachricht für **{Name}** ({Email})" statt Segment-Beschreibung.
5. **Button "Personalisierte Nachricht generieren"** ist disabled, solange bei `single` kein Gast gewählt ist.
6. **Payload an Edge Function `generate-personalized-email`**:
   - Bei `single` wird der gewählte Gast als einziger `sampleGuests`-Eintrag mitgeschickt (Name, Umsatz, Aufenthaltsdauer, Saisonen, Loyalty).
   - Zusätzlich neues optionales Feld `targetGuest: { name, email }`, damit die KI den Namen in die Anrede übernehmen kann. Edge Function bleibt unverändert — sie nutzt bereits `sampleGuests[0]`, das neue Feld wird ignoriert falls nicht ausgewertet.
7. **Segment-Analyse-Block** wird bei `single` ausgeblendet (nicht sinnvoll für einen einzelnen Gast); stattdessen kleine Kennzahlen-Zeile (Aufenthalte, Gesamtumsatz, Letzter Aufenthalt).

## Nicht geändert
- Edge Function `generate-personalized-email`
- Versand-/Genehmigungs-Workflow
- Andere Tabs (E-Mail versenden, Vorlagen verwalten)
- Bestehende Segmente VIP/Stammgäste/Neu

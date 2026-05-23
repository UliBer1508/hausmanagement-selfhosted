## Ziel
In der Operations-Übersicht (`CleaningsCard`) soll man direkt einen neuen Reinigungsauftrag erstellen können.

## Änderungen

**Datei:** `src/components/Operations/CleaningsCard.tsx`

1. Lokalen State `dialogOpen` einführen.
2. Den `CreateCleaningTaskDialog` aus `src/components/Cleaning/CreateCleaningTaskDialog.tsx` importieren und kontrolliert (`open` / `onOpenChange`) einbinden.
3. Im `CardHeader` neben dem Counter-Badge einen kleinen Plus-Button (`Button variant="ghost" size="icon"` mit `Plus`-Icon, Tooltip "Neuer Reinigungsauftrag") hinzufügen, der `setDialogOpen(true)` aufruft.
4. Zusätzlich die gesamte Card-Leerstaats-Zeile ("Keine Reinigungen…") klickbar machen → öffnet ebenfalls den Dialog (CTA "+ Reinigungsauftrag erstellen").
5. Bestehende Reinigungs-Items bleiben unverändert (kein zusätzliches Click-Verhalten, um Verwechslungen mit Detail-Ansicht zu vermeiden).

## Keine weiteren Änderungen
- Keine Logik-Änderung am Dialog selbst.
- Keine Datenflüsse / Hooks geändert.
- Keine Status-Logik in der Card berührt.

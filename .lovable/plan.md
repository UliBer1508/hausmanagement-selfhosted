

# Abrechnungs-Button auf Provider-Portal-Cards

## Ist-Zustand
- Die Portal-Cards (Amela, Boris, Teuni) in `OriginalDashboard.tsx` (Zeilen 1716-1746) zeigen nur einen "Portal öffnen" Button
- Die Abrechnungsfunktion (`ProviderBillingDialog`) ist nur über die Provider-Verwaltung erreichbar
- Der `ProviderBillingDialog` unterscheidet zwischen Reinigung (Task-basierte Abrechnung) und Wäscherei (Rechnungen/Bestellungen via Tabs)

## Änderungen

### `src/pages/OriginalDashboard.tsx`
- State hinzufügen: `selectedProviderForBilling` (wie im ProviderManagementDialog)
- Import `ProviderBillingDialog` und `FileSpreadsheet` Icon
- In der Portal-Card (Zeile 1733-1743) einen zweiten Button "Abrechnung" hinzufügen mit dem gleichen Styling wie "Portal öffnen" aber `variant="outline"`
- Der Button öffnet den `ProviderBillingDialog` mit dem jeweiligen Provider
- `ProviderBillingDialog` am Ende des JSX rendern

### Button-Layout in der Card
```text
┌─────────────────────────┐
│   ✨ Amela Cleaning     │
│                         │
│   Reinigungsaufträge    │
│   verwalten             │
│                         │
│  [  Portal öffnen    ]  │  ← bestehend (blau, primary)
│  [  Abrechnung       ]  │  ← neu (outline, gleiche Breite)
└─────────────────────────┘
```

### Technische Details
- Kein Schema-Änderung nötig
- `ProviderBillingDialog` wird wiederverwendet — erkennt anhand `service_type` ob Reinigung oder Wäscherei angezeigt wird
- FileSpreadsheet-Icon vor "Abrechnung" für visuelle Konsistenz




## Plan: App-Bewertungen in App Tracking verschieben

### Ziel
Die "App-Bewertungen von Gästen" (AppReviewsSection) soll aus dem Analysen-Tab entfernt und in den App Tracking-Tab integriert werden, da beide Komponenten zur Gäste-App gehören und thematisch zusammenpassen.

### Aenderungen

#### 1. GuestAnalytics.tsx - AppReviewsSection entfernen

- Import von `AppReviewsSection` entfernen (Zeile 8)
- Komponente `<AppReviewsSection selectedHouseId={selectedHouseId} />` entfernen (Zeile 1526)

#### 2. GuestAppTracking.tsx - AppReviewsSection hinzufuegen

- Import hinzufuegen: `import { AppReviewsSection } from './AppReviewsSection';`
- Nach der Sessions-Tabelle die AppReviewsSection einfuegen:

```typescript
return (
  <div className="space-y-6">
    {/* Header */}
    ...
    
    {/* Stats Cards */}
    ...
    
    {/* Filters */}
    ...
    
    {/* Sessions Table */}
    ...
    
    {/* NEU: App Reviews Section */}
    <AppReviewsSection selectedHouseId={filters.houseId === 'all' ? '' : filters.houseId} />
  </div>
);
```

### Ergebnis

Nach der Umsetzung:
- Der **Analysen-Tab** enthaelt nur noch die Buchungs-/Gaesteanalysen (Statistiken, Charts, Nationalitaeten, Umsatz, etc.)
- Der **App Tracking-Tab** enthaelt alles zur Gaeste-App:
  - Sessions-Statistiken (4 Karten)
  - Filter und Sessions-Tabelle
  - Detail-Ansicht mit Events, Praeferenzen, Aktivitaeten
  - App-Bewertungen von Gaesten (mit Tabelle, Ratings, Feedback)

### Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `src/components/Guests/GuestAnalytics.tsx` | AppReviewsSection Import + Komponente entfernen |
| `src/components/Guests/GuestAppTracking.tsx` | AppReviewsSection Import + Komponente hinzufuegen |


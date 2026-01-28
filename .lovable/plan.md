
## Gaeste-Tracking Dashboard fuer Hausverwaltung

### Uebersicht
Integration eines neuen Gaeste-Tracking Dashboards in den bestehenden GuestAnalytics-Tab im Gaeste-Management. Das Dashboard visualisiert Tracking-Daten aus der Gaeste-App (urlaubplaner-ki.lovable.app).

### Aktuelle Situation
- **Datenbank-Tabellen existieren bereits:**
  - `guest_app_sessions`: 17 Sessions vorhanden
  - `guest_app_events`: Events wie page_visit, button_click vorhanden
  - `guest_preference_responses`: Praeferenzen der Gaeste
  - `guest_saved_activities`: Geplante Aktivitaeten
  - `app_reviews`: 1 Bewertung (5 Sterne) vorhanden
- **GuestAnalytics.tsx**: Sehr umfangreiche Komponente (1531 Zeilen) mit bestehenden Charts und AppReviewsSection

### Architektur-Entscheidung
Aufgrund der Groesse und Komplexitaet wird das Gaeste-Tracking Dashboard als **separate Komponente** implementiert und am Ende von GuestAnalytics eingebunden (wie AppReviewsSection).

### Zu erstellende Dateien

#### 1. `src/components/Guests/GuestAppTracking.tsx` (Hauptkomponente)
Enthaelt:
- 4 Statistik-Karten (Sessions, Identifiziert, Onboarding abgeschlossen, Ø Bewertung)
- Filter-Leiste (Zeitraum, Haus, Status)
- Sessions-Tabelle mit klickbaren Zeilen
- Zustand fuer ausgewaehlte Session (Detail-Ansicht)

#### 2. `src/components/Guests/GuestSessionDetail.tsx` (Detail-Ansicht)
Zeigt bei Klick auf eine Session:
- Gast-Info (Name, Email, Haus, Geraet, Sprache)
- Praeferenzen-Uebersicht mit Label-Mapping
- Gespeicherte Aktivitaeten mit alpine_activities JOIN
- Event-Timeline (chronologisch)
- App-Bewertung (falls vorhanden)

#### 3. `src/hooks/useGuestAppTracking.ts` (Daten-Hook)
React Query Hooks fuer:
- `useGuestAppSessions()`: Alle Sessions mit Buchungs-/Haus-Daten
- `useGuestSessionDetails(sessionId)`: Einzelne Session mit Events, Praeferenzen, Aktivitaeten
- `useGuestAppStats()`: Aggregierte Statistiken

### Integration in bestehende Komponente

**GuestAnalytics.tsx** (Zeile 1525-1527):
```typescript
{/* App Reviews Section */}
<AppReviewsSection selectedHouseId={selectedHouseId} />

{/* NEU: Gaeste-Tracking Dashboard */}
<GuestAppTracking selectedHouseId={selectedHouseId} />
```

### Komponenten-Struktur

```text
GuestAppTracking
├── Statistik-Karten (4x Card)
│   ├── Sessions gesamt
│   ├── Identifizierte Gaeste (mit Email)
│   ├── Onboarding abgeschlossen
│   └── Ø App-Bewertung
├── Filter-Leiste
│   ├── Zeitraum (Heute / 7 Tage / 30 Tage / Alle)
│   ├── Haus (Dropdown)
│   └── Status (Alle / Identifiziert / Abgeschlossen)
├── Sessions-Tabelle (Table)
│   └── Zeilen klickbar -> oeffnet Detail-Ansicht
└── GuestSessionDetail (bei Auswahl)
    ├── Header mit Zurueck-Button
    ├── Gast-Info Badge-Leiste
    ├── Praeferenzen-Karte
    ├── Gespeicherte Aktivitaeten
    ├── Event-Timeline
    └── App-Bewertung (falls vorhanden)
```

### Datenbank-Abfragen

**Sessions-Liste:**
```sql
SELECT 
  s.*,
  b.guest_name as booking_guest_name,
  b.check_in, b.check_out,
  h.name as house_name
FROM guest_app_sessions s
LEFT JOIN bookings b ON s.booking_id = b.id
LEFT JOIN houses h ON b.house_id = h.id
ORDER BY s.last_activity_at DESC
```

**Session-Detail Events:**
```sql
SELECT * FROM guest_app_events 
WHERE session_id = ?
ORDER BY created_at ASC
```

**Session-Praeferenzen:**
```sql
SELECT preference_key, preference_value 
FROM guest_preference_responses 
WHERE session_id = ?
```

**Gespeicherte Aktivitaeten:**
```sql
SELECT gsa.*, aa.name as activity_name, aa.main_category
FROM guest_saved_activities gsa
LEFT JOIN alpine_activities aa ON gsa.activity_id = aa.id
WHERE gsa.session_id = ?
```

### UI-Elemente

**Geraetetyp-Badge:**
- Mobile: 📱 Mobile
- Tablet: 📱 Tablet
- Desktop: 💻 Desktop

**Status-Badge:**
- Fertig (completed_onboarding=true): ✅ Fertig (gruen)
- Identifiziert (guest_email != null): 👤 Identifiziert (blau)
- Sonstiges: ⏳ Schritt: [furthest_step] (grau)

**Event-Icons:**
- page_visit: 📍
- button_click: 🔘
- search: 🔍
- preference: 🎯
- activity: 💾
- event: ✅

### Praeferenz-Label-Mapping
```typescript
const preferenceLabels = {
  activity_types: 'Aktivitaeten',
  travel_companions: 'Reisegruppe',
  duration: 'Dauer',
  budget_range: 'Budget',
  activity_level: 'Aktivitaetslevel',
  max_travel_time: 'Max. Anfahrt',
  weather_preference: 'Wetter',
  transport_mode: 'Transport',
  start_location: 'Startort',
  special_interests: 'Interessen'
};

const valueLabels = {
  'solo': 'Alleine',
  'couple': 'Paar',
  'family': 'Familie',
  'half-day': 'Halbtags',
  'full-day': 'Ganztags',
  'low': 'Guenstig',
  'medium': 'Mittel',
  'high': 'Gehoben',
  'relaxed': 'Entspannt',
  'moderate': 'Moderat',
  'active': 'Aktiv',
  'ski_touring': 'Skitouren',
  'hiking': 'Wandern',
  // ...weitere
};
```

### Zeitformatierung
```typescript
const formatTimeAgo = (dateString: string): string => {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `vor ${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tagen`;
};
```

### Technische Details

**Props fuer GuestAppTracking:**
```typescript
interface GuestAppTrackingProps {
  selectedHouseId: string; // Von GuestAnalytics uebergeben
}
```

**Bestehende UI-Komponenten nutzen:**
- Card, CardHeader, CardContent, CardTitle
- Table, TableHeader, TableBody, TableRow, TableCell
- Badge
- Select, SelectTrigger, SelectContent, SelectItem
- Button
- ScrollArea (fuer Event-Timeline)
- Skeleton (Loading-States)

### Filterlogik

**Zeitraum-Filter:**
- Heute: `started_at >= heute 00:00`
- 7 Tage: `started_at >= heute - 7 Tage`
- 30 Tage: `started_at >= heute - 30 Tage`
- Alle: Kein Filter

**Haus-Filter:**
- Via `booking_id -> bookings.house_id = selectedHouseId`

**Status-Filter:**
- Alle: Kein Filter
- Identifiziert: `guest_email IS NOT NULL`
- Abgeschlossen: `completed_onboarding = true`

### Zusammenfassung der Aenderungen

| Datei | Aktion |
|-------|--------|
| `src/hooks/useGuestAppTracking.ts` | Neu erstellen |
| `src/components/Guests/GuestSessionDetail.tsx` | Neu erstellen |
| `src/components/Guests/GuestAppTracking.tsx` | Neu erstellen |
| `src/components/Guests/GuestAnalytics.tsx` | Import + Einbindung hinzufuegen |

### Keine Datenbank-Aenderungen erforderlich
Alle Tabellen existieren bereits mit korrektem Schema.

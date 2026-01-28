
## Plan: Gaeste-App Tracking Tab hinzufuegen + Build-Fehler beheben

### Teil 1: Build-Fehler beheben

Das Hauptproblem ist, dass die JavaScript-Datei (5.29 MB) das PWA-Workbox-Limit von 5 MB ueberschreitet.

**Aenderung in `vite.config.ts`:**
- Zeile 20: `maximumFileSizeToCacheInBytes` von 5 MB auf 6 MB erhoehen

```typescript
maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6MB statt 5MB
```

---

### Teil 2: Gaeste-App Tracking als neuen Tab hinzufuegen

Die aktuelle Tab-Reihenfolge ist:
1. Uebersicht
2. Analysen
3. Kommunikation
4. Segmente
5. Marketing

Die neue Reihenfolge mit 6 Tabs:
1. Uebersicht
2. Analysen
3. Kommunikation
4. Segmente
5. Marketing
6. **App Tracking** (NEU - rechts neben Marketing)

**Aenderungen in `src/components/Guests/GuestManagement.tsx`:**

1. **Import hinzufuegen:**
```typescript
import { GuestAppTracking } from './GuestAppTracking';
```

2. **TabsList von 5 auf 6 Spalten erweitern:**
```typescript
<TabsList className="grid w-full grid-cols-2 lg:grid-cols-6 h-auto gap-1">
```

3. **Neuen TabsTrigger nach Marketing hinzufuegen:**
```typescript
<TabsTrigger value="tracking" className="flex-col h-auto py-2 gap-1">
  <span className="text-base">📱</span>
  <span className="text-xs">App Tracking</span>
</TabsTrigger>
```

4. **Neuen TabsContent nach Marketing hinzufuegen:**
```typescript
<TabsContent value="tracking" className="space-y-6">
  <GuestAppTracking selectedHouseId="" />
</TabsContent>
```

---

### Teil 3: GuestAppTracking aus GuestAnalytics entfernen

Da das Tracking jetzt ein eigener Tab ist, muss es aus GuestAnalytics entfernt werden.

**Aenderung in `src/components/Guests/GuestAnalytics.tsx`:**
- Import von `GuestAppTracking` entfernen
- Die `<GuestAppTracking selectedHouseId={selectedHouseId} />` Komponente am Ende entfernen

---

### Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `vite.config.ts` | PWA Cache-Limit auf 6 MB erhoehen |
| `src/components/Guests/GuestManagement.tsx` | Import + 6. Tab "App Tracking" hinzufuegen |
| `src/components/Guests/GuestAnalytics.tsx` | GuestAppTracking Komponente entfernen |

### Ergebnis

Nach der Umsetzung:
- Build-Fehler ist behoben
- GuestManagement hat 6 Tabs statt 5
- "App Tracking" erscheint als letzter Tab rechts neben "Marketing"
- Tab zeigt das vollstaendige Gaeste-App Tracking Dashboard mit Sessions, Statistiken und Detail-Ansicht

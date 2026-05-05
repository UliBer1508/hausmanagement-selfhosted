## Ziel

Den "Preise"-Tab inline ins Dashboard integrieren — wie alle anderen Module (Kalender, Buchungen, Wäsche etc.) — statt zur separaten Route `/pricing` zu navigieren.

## Änderungen in `src/pages/OriginalDashboard.tsx`

1. **Import hinzufügen** (oben bei den Pricing-Komponenten):
   ```ts
   import PricingDashboard from '@/components/Pricing/PricingDashboard';
   import { supabase } from '@/integrations/supabase/client';
   ```

2. **Tab-Click-Handler vereinfachen** (Zeilen ~2644–2645): Sonderlogik für `'Preise'` entfernen. Der Klick ruft wieder nur `setActiveTab(tab.name)` auf — wie alle anderen Tabs. `useNavigate` darf bleiben oder entfernt werden.

3. **Neuer Case in `renderTabContent()`** (vor `case 'Einstellungen'`, ca. Zeile 1763):
   ```tsx
   case 'Preise':
     return <PricingTabContent />;
   ```

4. **Neue lokale Komponente `PricingTabContent`** (im selben File, oberhalb des Default-Exports oder als kleine Helper-Komponente). Sie übernimmt exakt die Logik aus `src/pages/Pricing.tsx`:
   - Lädt alle Häuser mit `rental_type='tourist'`
   - Zeigt Header "Dynamische Preise" + Haus-Auswahl-Dropdown
   - Rendert `<PricingDashboard houseId=… propertyName=… location=… />`

## Aufräumen (optional, empfohlen)

- `src/pages/Pricing.tsx` und die Route `<Route path="/pricing" …>` in `src/App.tsx` können entfernt werden, da nicht mehr benötigt. Falls Direkt-Links erhalten bleiben sollen, einfach drin lassen.

## Ergebnis

Klick auf "💶 Preise" zeigt das Pricing-Modul innerhalb des Dashboards an — gleicher Header, gleiche Navigation, kein Routenwechsel. Verhalten konsistent zu den anderen Modulen.
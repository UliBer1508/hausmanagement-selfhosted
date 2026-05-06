## Ziel
Eliminierung der manuellen Synchronisation zwischen Frontend-Defaults (`src/hooks/usePricingSettings.ts`) und den Edge-Function-Mirrors in `airroi-sync` und `import-inside-airbnb`.

## Lösung
Eine gemeinsame Defaults-Datei einführen, die sowohl von Deno (Edge Functions) als auch vom Vite/TS-Frontend importierbar ist. Da Deno `https://`-Imports erwartet und das Frontend relative Pfade, wird die Quelle als reines TS-Modul ohne Runtime-Abhängigkeiten in `supabase/functions/_shared/pricingDefaults.ts` abgelegt und im Frontend per relativem Pfad re-exportiert.

### Neue Datei: `supabase/functions/_shared/pricingDefaults.ts`
- Exportiert `DEFAULT_PRICING_CONFIG` (kompletter Block aus aktuellem `usePricingSettings.ts`)
- Exportiert abgeleitete Konstanten:
  - `DEFAULT_SEASON_FACTORS = DEFAULT_PRICING_CONFIG.season_factors`
  - `DEFAULT_AIRROI_CONFIG` (subset object: airroi_* Felder + season_factors)
- Exportiert Type `PricingConfig = typeof DEFAULT_PRICING_CONFIG`
- Keine Imports, keine Deno-/Browser-spezifischen APIs → funktioniert in beiden Runtimes.

### Änderungen Frontend
- `src/hooks/usePricingSettings.ts`:
  - Re-export von `DEFAULT_PRICING_CONFIG` und `PricingConfig` aus `../../supabase/functions/_shared/pricingDefaults`
  - Lokale Definition entfernen, restliche Hooks unverändert
- Konsumenten (`useDynamicPricing.ts`, `marketOccupancyService.ts`, `PricingFactorsConfig.tsx`) behalten bestehenden Import aus `@/hooks/usePricingSettings` → keine Anpassung nötig.

### Änderungen Edge Functions
- `supabase/functions/airroi-sync/index.ts`:
  - Mirror-Block (Zeilen 10–22) entfernen
  - `import { DEFAULT_AIRROI_CONFIG, DEFAULT_SEASON_FACTORS } from "../_shared/pricingDefaults.ts";`
- `supabase/functions/import-inside-airbnb/index.ts`:
  - Mirror (Zeilen 15–16) entfernen
  - `import { DEFAULT_SEASON_FACTORS } from "../_shared/pricingDefaults.ts";`

### Verifikation
- TS-Compile durch Vite: relativer Import auf eine reine `.ts`-Datei außerhalb `src/` funktioniert (Vite erlaubt das, Pfad liegt im Repo). Falls TS-strict-Pfade Probleme machen, alternativ Datei in `src/shared/pricingDefaults.ts` legen und vom Edge-Function-Code per relativem `../../../src/shared/...` Pfad importieren ist NICHT möglich (Edge Functions dürfen nicht aus `src/` importieren). Daher bleibt `_shared` der Master und das Frontend importiert von dort.
- Falls Vite/TS den Import außerhalb `src/` nicht akzeptiert (rootDir/include), Anpassung: `tsconfig`-`include` umfasst bereits `supabase/functions/_shared/pricingDefaults.ts` durch expliziten Import nicht zwingend — bei Bedarf Pfad-Alias `@shared/*` in `tsconfig.json` und `vite.config.ts` ergänzen.

## Resultat
Eine einzige Quelle für Pricing-Defaults. Änderungen gelten automatisch in Frontend und beiden Edge Functions.
## Ziel
Versionsnummer im Footer nicht mehr hartkodieren, sondern dynamisch aus `package.json` lesen. Künftige Versionsbumps benötigen dann nur noch eine Änderung in `package.json`.

## Änderungen

### `src/components/Layout/AppLayout.tsx`
1. JSON-Import hinzufügen:
   ```ts
   import pkg from '../../../package.json';
   ```
2. Footer-Zeile anpassen:
   ```tsx
   © {new Date().getFullYear()} Steinbock Chalets · v{pkg.version}
   ```

## Hinweise
- Vite unterstützt JSON-Imports nativ — keine zusätzliche Konfiguration nötig.
- `tsconfig` erlaubt standardmäßig `resolveJsonModule` in Vite-Projekten; falls TypeScript meckert, ergänze `"resolveJsonModule": true` in `tsconfig.app.json` (wird vor Umsetzung geprüft).
- Keine weiteren Stellen im Code zeigen aktuell die Version an.

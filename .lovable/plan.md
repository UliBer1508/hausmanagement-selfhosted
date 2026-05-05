## Ziel
Bun als alleinigen Package Manager etablieren, npm- und Legacy-Lockfiles entfernen.

## Schritte

1. **Lockfiles bereinigen**
   - `package-lock.json` löschen
   - `bun.lockb` löschen (Legacy-Binärformat)
   - `bun.lock` behalten (Single Source of Truth)

2. **`.gitignore` ergänzen**
   - Einträge hinzufügen, damit fremde Lockfiles nicht versehentlich wieder eingecheckt werden:
     ```
     package-lock.json
     yarn.lock
     pnpm-lock.yaml
     bun.lockb
     ```

3. **`package.json` aktualisieren**
   - Feld `"packageManager": "bun@1.1.0"` ergänzen, um den Manager explizit zu dokumentieren
   - `"engines"` optional erweitern: `{ "bun": ">=1.1.0" }`

4. **README-Hinweis (optional, falls vorhanden)**
   - Kurzer Block: „Dieses Projekt nutzt **Bun**. Installation: `bun install`. Bitte kein `npm install` verwenden."

## Risiken
- Geringfügige Versionsunterschiede nach Re-Install: Lovable triggert nach den Änderungen automatisch einen Build. Falls Fehler auftreten, einzelne Pakete pinnen.

## Nicht enthalten
- Keine Code-Änderungen an Komponenten/Logik
- Keine Datenbank-Migrationen
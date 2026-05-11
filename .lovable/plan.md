## Änderung

In `src/components/Houses/AutoLinenOrderSettingsCard.tsx` direkt **unterhalb** des Sync-Header-Blocks (nach der Zeile mit Toggle/Artikel-Mapping-Button, vor dem `{localExternalSyncEnabled && ...}`-Conditional) eine **blaue Info-Box** im selben Stil wie die "Wie funktioniert die Automatisierung?"-Box einfügen:

```tsx
<div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
  <p className="text-sm text-blue-800 dark:text-blue-200">
    <strong>Wie funktioniert die Synchronisation?</strong><br />
    Wenn aktiviert, werden Wäschebestellungen automatisch an das externe
    <strong> Oberpinzgau-Wäscheportal</strong> gesendet, sobald sie den Status
    <strong> "Ausstehend"</strong> erhalten. Voraussetzung ist, dass jeder Artikel
    über das <strong>Artikel-Mapping</strong> einer externen Artikelnummer zugeordnet wurde.
    Die Übertragung erfolgt einseitig — Statusänderungen im externen Portal werden
    nicht zurück synchronisiert.
  </p>
</div>
```

Reine UI-Ergänzung, keine Logik-Änderung. Der bestehende gelbe Hinweis-Block bleibt unverändert (sichtbar nur bei aktivem Sync).
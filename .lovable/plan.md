## Ziel
Nur **eine** Konfigurationskarte mit **einem** Speichern-Button. AirROI-Filter wandern als neuer Accordion-Abschnitt „Datenquellen" in die bestehende „Preis-Faktoren konfigurieren"-Karte.

## Änderungen

### 1. `src/components/Pricing/PricingDashboard.tsx`
- Import und Render von `<GlobalPricingConfigCard />` entfernen.
- Import-Statement von `GlobalPricingConfigCard` entfernen.

### 2. `src/components/Pricing/GlobalPricingConfigCard.tsx`
- Datei löschen (nicht mehr referenziert).

### 3. `src/components/Pricing/PricingFactorsConfig.tsx`
- Zusätzlich zum house-spezifischen `pricing_config` auch die globale `system_settings.pricing_config` über `usePricingSettings` / `useSavePricingSettings` laden.
- Neuer State `airroiForm` (4 Felder: `airroi_room_type`, `airroi_min_bedrooms`, `airroi_num_months`, `airroi_currency`) initialisiert aus `usePricingSettings`.
- Neuer **Accordion-Eintrag** an erster Position des bestehenden `<Accordion>`:
  - Trigger: „Datenquellen (AirROI Marktdaten)"
  - Hinweisbox (`bg-muted/30`):
    > „Diese Filter bestimmen, welche Vergleichsobjekte AirROI für die Marktauslastung heranzieht. Der ermittelte Auslastungswert fließt als Eingabe in den Preisalgorithmus oben ein."
  - 4 Felder im 2-Spalten-Grid: Zimmertyp (Select), Mindest-Schlafzimmer (Number), Analysezeitraum (Select 6/12/24/36), Währung (Select EUR/USD/native).
- `handleSave()` erweitern: schreibt **parallel** house-`pricing_config` (Faktoren) **und** `system_settings.pricing_config` (AirROI-Felder). Toast nur bei beidseitigem Erfolg, sonst Fehler.
- `handleReset()` erweitert: setzt sowohl Faktoren als auch AirROI-Felder auf Defaults zurück (kein Auto-Save).
- Untertitel der Card-Überschrift anpassen: „Multiplikatoren (pro Haus) & Datenquellen-Filter (global)."

### 4. Keine DB-Migrationen nötig
- AirROI-Werte bleiben in `system_settings` mit Key `pricing_config`.
- Edge Function `airroi-sync` bleibt unverändert (liest dieselbe Quelle).

## Auswirkungen
- Nur eine Karte sichtbar, ein Speichern-Button speichert alles.
- Bestehende globale Config-Werte in `system_settings.pricing_config` bleiben erhalten und werden weiter genutzt.
- Die nicht mehr in der UI bedienbaren globalen Algorithmus-Felder (`season_factors`, `dow_factors` etc. aus `DEFAULT_PRICING_CONFIG`) werden in `system_settings` weiterhin als Fallback für die Edge Functions konserviert — der Save-Flow überschreibt nur die 4 AirROI-Felder und lässt die übrigen Felder unverändert.

## Fehler

`update_dynamic_price` referenziert `houses.base_price` — diese Spalte existiert nicht. Der Basispreis liegt in `houses.pricing_config` (JSONB) und wird ohnehin vom Frontend übergeben, wird in der Funktion aber gar nicht gebraucht.

## Lösung (zwei kleine Änderungen)

**1. Migration**: Funktion `update_dynamic_price` neu erstellen ohne den `SELECT base_price FROM houses`-Block (Variable `v_base_price` entfernen). Logik bleibt sonst identisch.

**2. Keine Codeänderung nötig** — `DynamicPricingPanel` ruft die RPC bereits korrekt auf.

Nach Approval führe ich die Migration aus, danach funktioniert "Preis akzeptieren" sofort.

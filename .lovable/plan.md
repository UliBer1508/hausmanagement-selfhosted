## Migration: Covering Indexes für Foreign Keys

Erstellt 9 neue Indexe auf häufig abgefragten Foreign-Key-Spalten, um Query-Performance zu verbessern. Alle Befehle nutzen `CREATE INDEX IF NOT EXISTS` — idempotent und sicher.

### Was passiert
- 9 neue B-Tree Indexe werden angelegt
- Keine bestehenden Indexe werden geändert oder gelöscht
- Keine Tabellenstruktur, RLS-Policies oder Daten werden verändert
- Keine Anwendungscode-Änderungen

### Betroffene Indexe
1. `idx_linen_orders_laundry_invoice_id` auf `linen_orders(laundry_invoice_id)`
2. `idx_linen_orders_related_linen_order_id` auf `linen_orders(related_linen_order_id)`
3. `idx_service_tasks_related_task_id` auf `service_tasks(related_task_id)`
4. `idx_utility_costs_category_id` auf `utility_costs(category_id)`
5. `idx_utility_statements_house_id` auf `utility_statements(house_id)`
6. `idx_tenant_payments_house_id` auf `tenant_payments(house_id)`
7. `idx_tenant_rent_changes_house_id` auf `tenant_rent_changes(house_id)`
8. `idx_houses_default_provider_id` auf `houses(default_provider_id)`
9. `idx_profiles_provider_id` auf `profiles(provider_id)`

### Sicherheits-Check (bereits verifiziert)
- Alle Spalten existieren ✅
- Keiner der Indexe existiert bereits → keine Konflikte ✅
- `IF NOT EXISTS` macht Migration wiederholbar ✅
- Guest-App-Tabellen werden bewusst ausgelassen ✅

### Vorsichtsmaßnahmen
- Index-Erstellung sperrt die Tabelle nur kurz für Schreibvorgänge (kleine Tabellen → millisekunden). Falls eine Tabelle sehr groß ist, könnte das kurz spürbar sein — aber kein Datenverlust-Risiko.
- Bei Fehler in einem `CREATE INDEX` rollt die gesamte Migration zurück.

Nach deiner Bestätigung führe ich die Migration über das Migrations-Tool aus.
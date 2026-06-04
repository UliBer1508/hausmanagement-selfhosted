## Bewertung des Prompts

Der Prompt ist **sinnvoll und sicher**. Die Änderungen produzieren keine Fehler, wenn sie sauber umgesetzt werden. Ich habe die Datenbank inspiziert und bestätige:

### Teil A — Duplicate Indexes (verifiziert)
Für jede genannte Tabelle existieren tatsächlich **zwei identische Indexe** (gleiche Spalten, gleicher Typ). Die `_id`-Variante ist jeweils das Duplikat einer kürzeren Version, die erhalten bleibt:

| Drop (Duplikat)                              | Bleibt (gleiche Spalte)                   |
|----------------------------------------------|-------------------------------------------|
| `idx_cleaning_assignments_staff_id`          | `idx_cleaning_assignments_staff`          |
| `idx_cleaning_assignments_task_id`           | `idx_cleaning_assignments_task`           |
| `idx_competitor_properties_house_id`         | `idx_competitor_properties_house`         |
| `idx_preference_config_parent`               | `idx_onboarding_configuration_parent_id`  |
| `idx_provider_messages_provider_id`          | `idx_provider_messages_provider`          |

→ Risikofrei, kein App-Code betroffen.

### Teil B — RLS auth_rls_initplan
Ich habe die Policies in `pg_policies` gegengeprüft. Praktisch alle gelisteten Policies haben die Form:
```
has_role(auth.uid(), 'admin'::app_role)
```
Das Wrapping nach Supabase-Empfehlung ist:
```
has_role((select auth.uid()), 'admin'::app_role)
```
Das ändert **nur** die Planung (initplan statt per-row), nicht die Semantik. Roles (`authenticated` vs `public`), `USING`/`WITH CHECK` und Befehlstyp bleiben exakt erhalten.

### Wichtige Punkte, die der Prompt korrekt vorgibt
- `DROP POLICY IF EXISTS` + `CREATE POLICY` (idempotent)
- Tatsächliche aktuelle Definition jeder Policy inspizieren statt erraten
- `TO`-Klausel (z. B. `authenticated` vs default `public`) beibehalten — kritisch, sonst Rechteänderung
- `WITH CHECK` nur dort, wo es im Original existiert

### Hinweise / kleine Verbesserungen
1. **Policy-Namen exakt verifizieren**: Z. B. `user_roles → "Admin can modify roles"` muss vor dem Recreate überprüft werden (Schreibweise/Vorhandensein). Falls eine Policy nicht existiert, soll die Migration sie überspringen, nicht failen → `DROP POLICY IF EXISTS` reicht; `CREATE POLICY` darf aber nur erfolgen, wenn Originaltext bekannt ist.
2. **Keine `auth.*`-Calls in `SECURITY DEFINER`-Funktionen wrappen** — die hier betroffenen Policies rufen `has_role(auth.uid(), …)` direkt im Policy-Ausdruck, das ist der korrekte Ort.
3. **Reihenfolge**: Indexe zuerst droppen, dann Policies neu erstellen — unkritisch, aber sauber.
4. Migration als **ein** Transaktions-Block ausführen, damit bei Fehler alles zurückrollt.

### Plan
1. Aktuelle Definitionen aller gelisteten Policies via `pg_policies` einlesen (qual, with_check, roles, cmd).
2. Eine Migration generieren, die:
   - die 5 Duplikat-Indexe per `DROP INDEX IF EXISTS` entfernt,
   - für jede gelistete Policy `DROP POLICY IF EXISTS … ON … ;` gefolgt von `CREATE POLICY … ON … FOR <cmd> TO <roles> USING (…) WITH CHECK (…)` ausführt, wobei `auth.uid()` / `auth.role()` / `auth.jwt()` / `current_setting(...)` durch `(select …)` ersetzt werden — Rest 1:1 übernommen.
3. Über `supabase--migration` einreichen, anschließend Linter erneut laufen lassen, um Behebung zu bestätigen.

### Fazit
Der Prompt ist technisch korrekt, sicher (keine Logik-/Rechteänderung) und entspricht der offiziellen Supabase-Empfehlung für das `auth_rls_initplan`-Warning. Empfohlen umzusetzen.
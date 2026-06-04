# Prüfdokumentation — Datenbank-Sicherheit & Performance

**Projekte:** `my-sweet-home-manager` (Haus-Management), `fresh-spin-portal` (Teuni-Portal)
**Supabase-Projekt Haus-Management:** `usblrulkcgucxtkhugck`
**Erstellt:** Juni 2026
**Geprüft von:** Uli Berresheim (Admin)

---

## 1. Zusammenfassung

In dieser Arbeitsphase wurden die Datenbanken zweier Anwendungen abgesichert und Performance-Hinweise des Supabase-Linters abgearbeitet. Die Eingriffe betrafen drei Bereiche: Login-Absicherung des Teuni-Portals, Aktivierung von Row Level Security (RLS) im Haus-Management sowie Performance-Optimierungen (Indizes). Alle funktionskritischen Tests verliefen erfolgreich; die Apps laufen nach den Änderungen unverändert.

Leitprinzip bei allen Eingriffen: **Sicherheit und Funktion vor Vollständigkeit.** Es wurde bewusst nur das geändert, was nachweislich Nutzen bringt, und nichts entfernt, dessen Verwendung nicht zweifelsfrei ausgeschlossen werden konnte.

---

## 2. Teuni-Portal (`fresh-spin-portal`) — Login

### Durchgeführt
- Auth-Gate implementiert: Login-Screen (`LoginScreen.tsx`), Auth-Hook (`useAuth.ts`), App-Gate in `App.tsx`, Passwort-Änderung (`ChangePasswordDialog.tsx`).
- Drei Benutzer in Supabase angelegt: Admin (`uli.berresheim@hotmail.de`), Teuni (`waescheoberpinzgau@gmail.com`), interner Hidden-User (`amela@portal.local`).
- Header so angepasst, dass er auch auf Mobilgeräten sichtbar ist; Chat- und Anzeige-Einstellungen bleiben Desktop-only.
- Logout-Button auf Wunsch wieder entfernt (Gleichstand mit Amela-Portal).

### Konsequenz
- Das Portal ist nicht mehr ohne Anmeldung erreichbar.
- Teuni meldet sich einmalig an; die Session bleibt dauerhaft gespeichert (kein wiederholtes Login).
- Passwort-Änderung ist optional über den Schlüssel-Button erreichbar, auch mobil.

### Offen / bewusst belassen
- `amela@portal.local` bleibt als interner Benutzer ohne echte E-Mail. Konsequenz: Bei Passwortverlust ist kein automatischer Reset per E-Mail möglich — Passwort müsste dann manuell im Supabase-Dashboard neu gesetzt werden.

---

## 3. Haus-Management (`my-sweet-home-manager`) — Row Level Security

### Ausgangslage (kritisch)
Zahlreiche Tabellen waren über die öffentliche API ohne Anmeldung les- und teils schreibbar (Linter-Fehler `rls_disabled_in_public`, `policy_exists_rls_disabled`, `sensitive_columns_exposed`). Betroffen waren u. a. Gäste- und Mieterdaten (`guests`, `guest_preferences`, `saved_trip_plans`). Der öffentliche anon-Key liegt im Frontend-Code und ist damit für jeden einsehbar — der Frontend-Login allein bot daher keinen echten Schutz.

### Durchgeführt
- **Schritt 1 (Test):** RLS aktiviert für drei unkritische Cache-Tabellen (`weather_cache`, `route_cache`, `activity_cache`) mit Policy `Authenticated users full access` (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`). App-Test erfolgreich.
- **Schritt 2 (Rest):** RLS mit derselben Policy für ~54 weitere Tabellen aktiviert. Bei vier Tabellen mit veralteten Policies wurden diese zuvor entfernt. App-Test erfolgreich.

### Begründung des Policy-Musters
Das Haus-Management ist ein internes Admin-Werkzeug mit drei vertrauenswürdigen, angemeldeten Nutzern. Alle Server-Aufgaben laufen über Edge Functions mit `service_role`, die RLS ohnehin umgehen. Eine differenzierte Policy pro Nutzer ist daher nicht nötig — „angemeldet = darf alles" ist die korrekte und gewollte Einstellung.

### Konsequenz
- Anonymer Zugriff über den öffentlichen Key ist geschlossen. Gäste- und Mieterdaten sind nicht mehr ohne Anmeldung abrufbar (DSGVO-relevant).
- Für Admin, Amela und Teuni ändert sich nichts an der Bedienung.
- Die Wäsche-API-Schnittstelle (Edge Function `sync-linen-order-rest`, `service_role` + Bearer-Token zur externen Wäsche-App, Projekt `pkpnowevagxmhyqlawng`) ist nicht betroffen und läuft unverändert.

### Verbleibende Linter-Meldungen zu RLS (bewusst belassen)
- **`rls_policy_always_true` (~70×, WARN):** Folge des `USING (true)`-Musters. Beabsichtigt und korrekt für ein internes Admin-Tool. Keine Maßnahme.
- **`rls_enabled_no_policy` (4×, INFO):** Tabellen `optimization_feedback`, `recommendation_feedback`, `recommendation_metrics`, `search_algorithm_config`. RLS aktiv, keine Policy → nur `service_role` hat Zugriff (maximal dicht). Gehören zur separaten Gäste-App; vom Haus-Management nicht genutzt. Keine Maßnahme.

---

## 4. Haus-Management — bewusst NICHT geänderte Sicherheitspunkte

### `delete_booking_cascade` (anon ausführbar)
Funktion zum kaskadierenden Löschen von Buchungen ist theoretisch ohne Login über die API aufrufbar (Linter `anon_security_definer_function_executable`, WARN). Auf Entscheidung des Betreibers **bewusst belassen**. Konsequenz: Bleibt ein theoretisches Restrisiko; sollte bei Gelegenheit durch Entzug der `EXECUTE`-Rechte für `anon`/`authenticated` abgesichert werden.

### Klartext-Passwort im Browser (`fresh-spin-portal`, Login)
In der „Angemeldet bleiben"-Funktion wird das Passwort base64-kodiert (nicht verschlüsselt) im localStorage gespeichert. Hinweis dokumentiert; Behebung noch offen. Konsequenz: Wer kurzzeitig Zugriff auf das Gerät hat, könnte das Passwort auslesen. Empfehlung weiterhin: „Angemeldet bleiben"-Logik entfernen, da die Supabase-Session ohnehin dauerhaft erhalten bleibt.

### Repo-Sichtbarkeit
`my-sweet-home-manager` wurde für die Analyse mehrfach auf öffentlich gestellt. Empfehlung: nach Abschluss wieder auf **privat** setzen, da der anon-Key in der `.env` sonst öffentlich auf GitHub liegt.

### Dashboard-Punkte (kein Code)
- Leaked-Password-Schutz (HaveIBeenPwned) ist deaktiviert — Aktivierung empfohlen (Authentication → Settings).
- Postgres-Version hat verfügbare Sicherheitspatches — Upgrade empfohlen (vorher Backup).
- Bucket `house-images` erlaubt Auflisten aller Dateien — geringfügig, optional einschränkbar.

---

## 5. Haus-Management — Performance

### 5.1 Doppelte Indizes (`duplicate_index`, WARN) — bereinigt
Fünf Index-Paare auf identischen Spalten. Jeweils einer pro Paar entfernt:
- `cleaning_assignments`: `idx_cleaning_assignments_staff_id`, `idx_cleaning_assignments_task_id`
- `competitor_properties`: `idx_competitor_properties_house_id`
- `preference_configuration`: `idx_preference_config_parent`
- `provider_messages`: `idx_provider_messages_provider_id`

**Konsequenz:** Weniger Schreib-Overhead, kein Verlust an Lesegeschwindigkeit (der jeweils verbleibende identische Index deckt alles ab).

### 5.2 RLS-Policy-Performance (`auth_rls_initplan`, WARN)
Policies, die `auth.*()` / `current_setting()` pro Zeile neu auswerten. Lösung: Funktionsaufrufe in `(select …)` einwickeln (gleiche Logik, gleiche Sicherheit, schneller bei großen Tabellen). **Status:** Als Maßnahme vorbereitet/empfohlen; Wirkung erst bei großen Datenmengen relevant.

### 5.3 Fehlende FK-Indizes (`unindexed_foreign_keys`, INFO) — teilweise angelegt
Migration ausgeführt. **6 von 9 Indizes angelegt:**
- ✅ `idx_linen_orders_laundry_invoice_id`
- ✅ `idx_utility_costs_category_id`
- ✅ `idx_utility_statements_house_id`
- ✅ `idx_tenant_payments_house_id`
- ✅ `idx_tenant_rent_changes_house_id`
- ✅ `idx_profiles_provider_id`

**3 übersprungen** (Spalte existiert in dieser DB nicht):
- ❌ `linen_orders.related_linen_order_id`
- ❌ `service_tasks.related_task_id`
- ❌ `houses.default_provider_id`

**Konsequenz:** Joins und Lösch-/Filtervorgänge auf den genutzten Tabellen (Wäsche, Mieter, Nebenkosten, Profile) sind besser indiziert. Die übersprungenen Spalten existieren nicht — kein Handlungsbedarf, vermutlich Namensabweichung gegenüber dem Linter-Vorschlag. FK-Indizes auf reinen Gäste-App-Tabellen wurden bewusst nicht angelegt (nicht vom Haus-Management genutzt).

### 5.4 Ungenutzte Indizes (`unused_index`, ~70×, INFO) — bewusst belassen
**Konsequenz:** „Ungenutzt" bedeutet nur „seit letztem Statistik-Reset nicht verwendet". Bei der aktuell kleinen Datenmenge kosten diese Indizes praktisch nichts. Ein Löschen birgt das Risiko, dass selten genutzte Features (z. B. Jahresauswertungen) danach langsamer werden. Keine Maßnahme empfohlen, solange die DB klein bleibt.

### 5.5 Tabelle ohne Primary Key (`no_primary_key`, INFO)
`daily_pricing_backup` — reine Backup-Tabelle. Unkritisch, belassen.

---

## 6. Architektur-Erkenntnisse (für künftige Arbeiten)

- Es existieren **mehrere getrennte Supabase-Projekte / Apps**:
  - `usblrulkcgucxtkhugck` — Haus-Management (`my-sweet-home-manager`)
  - `fresh-spin-portal` — Teuni-Portal (Login abgesichert)
  - `pkpnowevagxmhyqlawng` — externe Wäsche-Management-App (API-Empfänger)
  - separate Gäste-App (Aktivitäts-Empfehlungen; nutzt `guest_app_*`, `activity_*`, `recommendation_*`, `saved_trip_plans` etc.)
- Die Gäste-App schreibt per `anon`-Policies in gemeinsame Tabellen; deren anon-INSERT-Policies dürfen **nicht** entfernt werden.
- Der frühere Portal-Token-Ansatz (`validate_portal_token`, `validate_provider_portal_token`) ist verworfen; heute laufen alle Portale über Email/Passwort-Login. Die Funktionen wurden nicht entfernt, da die Gäste-App nicht eingesehen werden konnte.

---

## 7. Gesamtbewertung

| Bereich | Status |
|---|---|
| Kritische RLS-Sicherheitslücken (ERROR) | ✅ behoben |
| Teuni-Portal Login | ✅ abgesichert |
| Doppelte Indizes | ✅ bereinigt |
| Sinnvolle FK-Indizes | ✅ angelegt (6/9) |
| RLS-Policy-Performance (`auth_rls_initplan`) | ⏳ vorbereitet, optional |
| `delete_booking_cascade` anon | ⚠️ bewusst offen |
| Klartext-Passwort Browser | ⚠️ offen, Behebung empfohlen |
| Dashboard: Leaked-PW-Schutz, Postgres-Upgrade | ⏳ manuell offen |
| Verbleibende WARN/INFO-Hinweise | ℹ️ eingeordnet, größtenteils bewusst belassen |

**Fazit:** Die sicherheitskritischen Punkte sind geschlossen. Die verbleibenden Hinweise sind durchweg WARN/INFO und überwiegend „erst bei großen Datenmengen relevant" — kein akuter Handlungsbedarf. Die wenigen bewusst offen gelassenen Punkte sind hier dokumentiert und können bei Bedarf nachgezogen werden.

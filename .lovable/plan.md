# Plan: Vollständige Umsetzung der 4 Next-Steps

## Ablauf

### Schritt 1 — Portal-Projekt vorbereiten (du machst es manuell, ich liefere)
Das Portal-Paket liegt fertig in `docs/portal-endpoints/`. Du kopierst es ins Portal-Projekt `pkpnowevagxmhyqlawng`:
- Migration `migration_partner_api_keys.sql` ausführen (legt `partner_api_keys` + `partner_api_log` an)
- Ordner `external-order-status/` und `external-invoices/` nach `supabase/functions/`
- `config-snippet.toml` in `supabase/config.toml` einfügen → automatischer Deploy

### Schritt 2 — Token im Portal generieren (du machst es)
Im Portal-Projekt SQL-Editor:
```sql
insert into partner_api_keys (kundennummer, token_hash, name)
values (
  'K470214',
  encode(digest('<KLARTEXT-TOKEN>', 'sha256'), 'hex'),
  'Steinbock Chalets Logik-App'
);
```
Klartext-Token vorher selbst generieren (z. B. via `openssl rand -hex 32`).

### Schritt 3 — Token hier als Secret hinterlegen (ich frage ab)
Ich rufe `secrets--add_secret` für `OBERPINZGAU_PARTNER_TOKEN` auf — du gibst den Klartext-Token (aus Schritt 2) sicher in das eingeblendete Formular ein. **Niemals im Chat posten.**

### Schritt 4 — Logik-App auf REST umstellen (ich code)

**4a) `supabase/functions/sync-laundry-invoices/index.ts`:**
- Ersetzt direkten `externalSupabase.from('rechnungen')`-Zugriff durch `fetch('https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-invoices?…', { Authorization: Bearer OBERPINZGAU_PARTNER_TOKEN })`
- Mapping bleibt identisch (Schema = `laundry_invoices`)
- Fallback: Wenn Secret fehlt → alter Direkt-DB-Pfad (Übergangs-Sicherheit)

**4b) `src/hooks/useExternalOrderStatus.ts`:**
- Beide Varianten (Single + Batch) rufen neue Edge Function `get-external-order-status` (intern) auf, die den Token serverseitig kennt und das Portal kontaktiert. So bleibt der Token im Server.
- Neue interne Edge Function `get-external-order-status` als dünner Proxy (nimmt `bestellnummer`/`bestellnummern`, ruft Portal, gibt JSON zurück, JWT-validiert).
- Direkter `externalLaundryClient`-Zugriff in diesem Hook entfernt.

**4c) Aufräumen:**
- `externalLaundryClient` bleibt nur für `ExternalArticleMappingDialog` (Artikel-Katalog) — bis ein REST-Endpoint dafür existiert. In `client.ts` Kommentar entsprechend ergänzen.
- Memory `data/external-orders-direct-database-access` aktualisieren (Status/Rechnungen jetzt via REST).

**4d) Smoke-Test:**
- `sync-laundry-invoices` einmal manuell triggern → Logs prüfen
- Eine bekannte Bestellnummer im Frontend laden → Status sollte erscheinen

## Was ich von dir brauche

Nur **ein** Klartext-Token: `OBERPINZGAU_PARTNER_TOKEN` (für unsere Kundennummer K470214). Den frage ich nach Approval dieses Plans über das Secret-Formular ab.

## Reihenfolge der Tool-Calls (nach Approval)

1. `secrets--add_secret(["OBERPINZGAU_PARTNER_TOKEN"])` → Wartet auf deine Eingabe
2. Code-Änderungen 4a + 4b + 4c (parallel-Patches)
3. Neue Edge Function `get-external-order-status` (Auto-Deploy)
4. Memory-Update
5. Smoke-Test via Edge-Function-Logs

## Voraussetzung

Schritte 1 und 2 müssen vor dem Smoke-Test im Portal abgeschlossen sein, sonst antworten die Endpoints mit 401/404. Code wird trotzdem schon deployed — wird automatisch funktional sobald Portal live ist.

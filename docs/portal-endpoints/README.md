# Portal-Endpoints für Wäsche Oberpinzgau

Dieses Paket enthält die zwei neuen REST-Endpoints, die im **externen Portal-Projekt**
`pkpnowevagxmhyqlawng` (Wäsche Oberpinzgau Portal) deployed werden müssen — **nicht**
in diesem Logik-App-Repo.

## Inhalt

| Datei | Zweck |
|-------|-------|
| `migration_partner_api_keys.sql` | Tabelle `partner_api_keys` + `partner_api_log` für Bearer-Token-Auth |
| `external-order-status/index.ts` | Edge Function: Bestellstatus-Abfrage (Einzel + Batch) |
| `external-invoices/index.ts` | Edge Function: Rechnungsabfrage (Schema = `laundry_invoices`) |
| `config-snippet.toml` | Einträge für `supabase/config.toml` (verify_jwt = false) |
| `BRIEFING-Hausverwaltung.md` | Kunden-Briefing mit curl-Beispielen |

## Deployment-Schritte (im Portal-Projekt)

1. Migration `migration_partner_api_keys.sql` ausführen
2. Beide Funktionsordner nach `supabase/functions/` kopieren
3. `config-snippet.toml`-Einträge in `supabase/config.toml` ergänzen
4. Funktionen werden bei Push automatisch deployed

## Token erzeugen (im Portal-Projekt)

```sql
-- Klartext-Token einmalig generieren (z. B. crypto.randomUUID() im Browser/Terminal),
-- SHA-256 hashen, und so einfügen:
insert into partner_api_keys (kundennummer, token_hash, name)
values ('K470214', encode(digest('<KLARTEXT-TOKEN>', 'sha256'), 'hex'), 'Steinbock Chalets');
```

Der Klartext-Token wird **einmalig** an die Hausverwaltung übergeben (z. B. via 1Password)
und im Logik-App-Projekt als Secret `OBERPINZGAU_PARTNER_TOKEN` hinterlegt.

# Migration: Lovable → Self-Hosted (Cloudflare/Vercel)

> ✅ **Status (aktualisiert):** Diese Migration ist abgeschlossen. Das hier als „Ist" genannte `my-sweet-home-manager` (Lovable) ist **stillgelegt/gelöscht** (Abruf 404). Aktives Repo: `hausmanagement-selfhosted`. Die alten Nennungen unten sind der historische Ausgangszustand.

> Status: **Plan / nicht begonnen** · Stand: 25.06.2026
> Repo (Ist): `UliBer1508/my-sweet-home-manager` (Lovable-gebunden)
> Supabase-Projekt (Ist): `usblrulkcgucxtkhugck`
> Vorbild: erfolgreiche Heizungs-Migration (`heizung.steinbockchalets-charge.com`)
>
> Dieses Dokument folgt der bewährten 6-Schritt-Anleitung aus der
> Heizungs-Migration, aber mit den **konkreten, code-belegten Zahlen dieses
> Projekts** (frisch geklont und gemessen am 25.06.2026).

---

## 0. Was dieses Projekt von der Heizung unterscheidet (wichtig)

| Aspekt | Heizung | Hausmanagement (dieses Projekt) |
|---|---|---|
| Lokaler Collector / Hardware | **ja** (config.json, wichtigster Live-Schritt) | **NEIN** — reines Web + Supabase → **Schritt 5 entfällt** |
| Tabellen | 33 | (aus Lovable-DB abzugleichen, siehe Schritt 2) |
| Edge Functions | 22 | **29** |
| Migrationsdateien | — | **172** |
| pg_cron-Jobs | 22 | **4** (in Migrationen, nicht in config.toml) |
| DB-Migrations-Lücke | `room_temperature_samples` fehlte | **noch zu prüfen** (Schritt 2) |

**Fazit:** Diese Migration ist **einfacher** als die Heizung (kein Collector),
aber das Backend ist **größer** (29 Functions statt 22). Der Aufwand liegt klar
in Schritt 2 (Supabase neu aufbauen).

---

## Schritt 1 — Code in eigenes GitHub-Repo holen

1. GitHub „Import a repository" → Kopie `hausmanagement-selfhosted` (browserbasiert,
   kein lokales Tooling nötig).
2. **`.env` aus dem Git-Tracking entfernen.** ⚠️ **Hier ist sie tatsächlich
   eingecheckt** (verifiziert: `git ls-files` listet `.env` und `.env.example`),
   obwohl `.gitignore` sie ausschließt. Das ist der „wunde Punkt" aus der Heizung.
   - `git rm --cached .env` → committen.
   - Inhalt ist **nur** der anon/publishable-Key (kein `service_role`, kein
     Stripe-Key im Frontend) → kein Notfall, aber trotzdem raus.
3. **Repo privat stellen** (Settings → Danger Zone → Change visibility).

> Hinweis aus Erfahrung: Claude kann **nicht** direkt ins Repo committen
> (GitHub-MCP read-only, 403 bei Schreibversuch). Bewährt: Claude bereitet
> Datei/Zeilen vor, du committest (oder Cursor als KI-Editor).

---

## Schritt 2 — Neues Supabase-Projekt komplett aufbauen (Hauptaufwand)

Reihenfolge wie bei der Heizung:

### 2.1 Projekt anlegen
Neues Supabase-Projekt → **URL und anon-Key notieren** (für `.env` neu und für
das Frontend-Hosting).

### 2.2 Schema bauen — 172 Migrationen
Die 172 Migrationsdateien in `supabase/migrations/` sind versioniert und können
per Supabase CLI eingespielt werden:
```
supabase db push   # spielt alle Migrationen in Reihenfolge ein
```
Sie enthalten Tabellen, RLS/Policies, Trigger, Funktionen **und** die 4
pg_cron-Jobs (siehe 2.4).

### 2.3 Edge Functions deployen — 29 Stück
Am zuverlässigsten per CLI (nicht über Lovable-Oberfläche):
```
supabase functions deploy <name>
```
Vollständige Liste:
```
add-competitor            airroi-sync               analyze-vacancy
auto-create-linen-orders  booking-analysis          calculate-booking-delta
chat-assistant            check-booking-linen-orders create-cleaning-task-for-booking
create-payment-link       daily-pricing             expand-daily-prices
external-stammdaten-proxy generate-booking-linen-order generate-guest-profile
generate-personalized-email generate-tenant-payments get-external-order-status
import-guest-list         insert-tenant-payments    optimize-linen-inventory
pricing-engine            scrape-competitor-prices  search-competitors
send-guest-email          stripe-webhook            sync-laundry-invoices
sync-linen-order-rest     (+ _shared: auth.ts, gemini.ts, pricingDefaults.ts)
```
> `_shared/` ist kein Function-Ordner, sondern geteilter Code — wird mit den
> Functions ausgeliefert, die ihn importieren.

### 2.4 pg_cron-Jobs neu einrichten — 4 Stück
Diese rufen per `net.http_post` Edge Functions auf. Im neuen Projekt müssen die
**URLs auf das neue Projekt** zeigen (sonst rufen sie das alte Lovable-Projekt!):

| Job-Name | Zeitplan | Zweck |
|---|---|---|
| `auto-create-linen-orders-daily` | `0 6 * * *` | tägl. 6:00 Wäschebestellungen |
| `daily-tenant-payment-generation` | `0 6 * * *` | tägl. 6:00 Mietzahlungen |
| `weekly-supabase-usage-report` | `0 9 * * 1` | Mo 9:00 Nutzungsreport |
| `monthly-competitor-price-scraping` | `0 3 15 * *` | 15. d. Monats 3:00 Konkurrenzpreise |

> ⚠️ Genau hier lag ein Heizungs-Fallstrick: Cron-Jobs leben **in der DB**, nicht
> in versioniertem Code-Sinn offensichtlich. Nach `db push` prüfen, ob sie
> existieren (`SELECT * FROM cron.job;`) und ob ihre `net.http_post`-URLs auf das
> **neue** Projekt zeigen.

### 2.5 Secrets setzen
Per CLI (`supabase secrets set KEY=...`), **Werte nie in einen Chat kopieren.**
Vollständige Liste der benötigten Secrets (aus dem Code extrahiert):

| Secret | Zweck |
|---|---|
| `SUPABASE_URL` | (von Supabase automatisch gesetzt) |
| `SUPABASE_ANON_KEY` | (automatisch) |
| `SUPABASE_SERVICE_ROLE_KEY` | (automatisch) |
| `GMAIL_USER` | Mail-Absender `steinbockchalets@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-stelliges Google App-Passwort |
| `GOOGLE_GEMINI_API_KEY` | KI-Texte (Gemini 2.5 Flash) |
| `STRIPE_SECRET_KEY` | Zahlungen (`sk_live_...` Hausverwaltung) |
| `STRIPE_WEBHOOK_SECRET` | Webhook-Signaturprüfung |
| `PERPLEXITY_API_KEY` | Konkurrenz-Recherche |
| `AIRROI_API_KEY` | Markt-/Preisdaten |
| `EXTERNAL_LAUNDRY_ANON_KEY` | externes Wäsche-Portal (Oberpinzgau) |
| `EXTERNAL_LAUNDRY_BEARER_TOKEN` | externes Wäsche-Portal REST |
| `OBERPINZGAU_PARTNER_TOKEN` | externes Wäsche-Portal Partner |
| `CRON_SECRET` | schützt Cron-Endpunkt `daily-pricing` |

### 2.6 Fallstrick „stille Tabellen" abgleichen
**Vor** dem Loslassen von Lovable: vollständige Tabellenliste aus der
Lovable-Cloud-DB ziehen und gegen die 172 Migrationen abgleichen. Bei der Heizung
existierte `room_temperature_samples` **nur** in der Cloud, in keiner Migration —
solche Tabellen fehlen sonst still im neuen Projekt.
Prüfung im alten Projekt:
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
```
→ gegen `grep -rh "CREATE TABLE" supabase/migrations/` abgleichen.

---

## Schritt 3 — Kerndaten importieren

1. **Erst Stammdaten**, die das System zum Laufen braucht — hier vermutlich:
   `houses`, `system_settings`, ggf. `pricing_config`, `linen_*`-Stammdaten,
   `guests`, `tenants`. (Exakte Liste beim Import festlegen.)
2. **Historien-/Verlaufsdaten optional** und später per CSV — bei großen Tabellen
   nur den jüngsten Zeitraum statt aller Zeilen.
3. ⚠️ **Auth-User werden NICHT mitmigriert.** Die (drei) Login-User im neuen
   Supabase **neu anlegen**. Danach Rollen prüfen: Das System nutzt eine
   `user_roles`-Tabelle mit `has_role(_user_id, 'admin')` — die neuen User
   brauchen die **admin-Rolle**, sonst sperren `requireAdmin`-Functions und RLS.

---

## Schritt 4 — Frontend hosten

1. Frontend auf **Vercel** deployen (Vite-Build, `npm run build`).
2. Eigene Subdomain über **Cloudflare** (CNAME, „DNS only"), SSL automatisch.
   - Analog Heizung (`heizung.steinbockchalets-charge.com`) z. B.
     `hausverwaltung.steinbockchalets-charge.com` (Subdomain final festlegen).
3. **Environment-Variablen in Vercel** setzen (nicht aus `.env` im Repo!):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_SUPABASE_PROJECT_ID` → auf das **neue** Projekt zeigend.
   - Der Client liest sauber aus `import.meta.env` (verifiziert in
     `src/integrations/supabase/client.ts`), also keine Code-Änderung nötig,
     nur die Vercel-Variablen.

> Hartkodierte Fremd-URL beachten: `src/integrations/externalLaundry/client.ts`
> enthält fest `https://pkpnowevagxmhyqlawng.supabase.co` + anon-Key des
> **externen Wäsche-Portals**. Das ist ein **fremdes** System (Oberpinzgau),
> bleibt **unverändert** — nicht mit der eigenen Migration verwechseln.

### Stripe-Webhook nachziehen (leicht zu übersehen)
Der Webhook ist bei Stripe auf die **alte** Function-URL registriert. Nach der
Migration im Stripe-Dashboard die Webhook-Endpoint-URL auf das neue Projekt
umstellen und das neue `STRIPE_WEBHOOK_SECRET` setzen, sonst werden Zahlungen
nicht mehr verbucht.

---

## ~~Schritt 5 — Lokale Anbindung umbiegen~~ — **ENTFÄLLT**

Das Hausmanagement hat **keinen** lokalen Collector (verifiziert: keine
`config.json`/Hardware-/`192.168`-Referenzen im Code). Dieser bei der Heizung
zentrale Schritt entfällt hier vollständig.

---

## Schritt 6 — Aufräumen (in dieser Reihenfolge)

1. **Kompromittierte Keys rotieren** — alles, was je im Klartext irgendwo stand:
   - der anon-Key aus der eingecheckten `.env` (neuer Key im neuen Projekt
     ohnehin),
   - bei Unsicherheit auch Gmail-App-Passwort und Stripe-Webhook-Secret neu.
2. **Repo privat** (falls in Schritt 1 noch nicht erledigt).
3. **Lovable-Projekt erst ganz zum Schluss löschen** — wenn das neue System
   **mehrere Tage stabil** läuft (Mails gehen raus, Cron-Jobs feuern, Stripe
   verbucht, Login funktioniert).

---

## Verifikations-Checkliste vor dem Lovable-Löschen

- [ ] Frontend lädt unter der neuen Cloudflare-Subdomain, Login funktioniert
- [ ] Neue Admin-User haben `admin`-Rolle (`has_role` liefert true)
- [ ] Alle 29 Edge Functions deployed (`supabase functions list`)
- [ ] Alle 4 pg_cron-Jobs existieren **und** zeigen auf das neue Projekt
- [ ] Tabellen-Abgleich Cloud-DB ↔ Migrationen ohne stille Lücke
- [ ] Stripe-Webhook auf neue URL + neues Secret umgestellt, Test-Zahlung verbucht
- [ ] Testmail „Per Gmail senden" kommt an (zuerst an eigene Adresse)
- [ ] Stammdaten importiert (Häuser, Settings, Gäste, Mieter)
- [ ] `.env` nicht mehr im Tracking, Repo privat, Keys rotiert
- [ ] System läuft mehrere Tage stabil → **dann** Lovable löschen

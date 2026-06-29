# Zugriffsrechte & Edge-Function-Sicherheit — Befunde

> Stand: 29.06.2026 · Repo: `hausmanagement-selfhosted` (Supabase `usblrulkcgucxtkhugck`)
> Grundlage: frisch geklonter `main`-Stand, am echten Code/Migrationen verifiziert.
> Ergänzt `docs/SECURITY_PERFORMANCE_AUDIT.md` und korrigiert den veralteten
> `docs/Auth-Implementation-Plan.md` (siehe Abschnitt 5).
>
> **Schwerpunkt dieser Prüfung (Vorgabe Uli):** „Funktioniert die Logik, funktionieren
> die Zugriffsrechte?" — nicht Kosmetik. Alle Aussagen sind am Code belegt.

---

## 0. Kurzfazit

Das Berechtigungssystem ist **im Kern solide**: Das `user_roles`/`has_role`-System ist
real und wird in **127 RLS-Policies** als Bedingung genutzt; `anon` (nicht eingeloggt)
kann **keine** Buchungen, Gäste, Zahlungen oder Kommunikation lesen. Das Gäste-Self-
Service ist über geheime Session-IDs sauber abgesichert.

Zwei Bereiche sind offen — **beide waren als Entwicklungs-Trade-off bekannt**, aber
bisher nicht vollständig/aktuell dokumentiert:

1. **`delete_booking_cascade` ist für `anon` ausführbar** — im Audit als „bewusst offen"
   geführt. **Neu hier:** der technische Grund (eine Migration macht eine frühere
   Härtung rückgängig) ist jetzt belegt → konkreter Fix in Abschnitt 2.
2. **20 Edge Functions laufen mit `verify_jwt = false` ohne internen Auth-Check** — im
   `Auth-Implementation-Plan.md` als Going-Live-Punkt erwähnt, aber mit **veralteten
   Function-Namen**. **Neu hier:** vollständige, klassifizierte Ist-Liste → Abschnitt 3.

Kein akuter Daten-Leak (anon liest keine sensiblen Tabellen), aber zwei reale
Missbrauchspfade (Löschen / Mailversand / Geldbeträge anstoßen) ohne Login.

---

## 1. Was sicher funktioniert (verifiziert, zur Beruhigung)

| Punkt | Beleg |
|---|---|
| Rollensystem aktiv | `has_role` als Bedingung in **127** Policy-Zeilen (6 Migrationen) |
| anon liest **nichts** Sensibles | kein `TO anon … SELECT` auf `bookings`/`guests`/`payments`/`tenant_payments`/`guest_communications` |
| anon darf nur gezielt schreiben | `booking_inquiries` INSERT (Website-Anfrage), `app_reviews` INSERT **mit `EXISTS`-Prüfung** gegen echte Buchung+Gastmail |
| anon liest nur kuratiert | nur die View `app_reviews_public` (gegrantet), nicht die Rohtabelle |
| Gäste-Self-Service dicht | `get_guest_session(_session_id)` gibt nur **eine** Session per geheimer ID zurück; `touch_guest_session` schreibt nur unkritische Felder (kein PII-Overwrite) |
| Frontend-Gate vorhanden | `ProtectedRoute.tsx` (Session-Check), `App.tsx` wrappt `/` |
| Bundle-Splitting | `App.tsx` nutzt bereits `React.lazy` für `Index`, `Login`, `NotFound`, `ChatAssistant` → frühere „ein-großer-Bundle"-Notiz ist **veraltet** |

> Hinweis: Das Frontend prüft nur „eingeloggt ja/nein", **keine** Rollen-Differenzierung
> (kein `has_role` im `src/`-Code außer in `types.ts`). Das ist korrekt, **weil** die
> echte Durchsetzung in der DB (RLS) und in `requireAdmin` (Edge) liegt. Bei einem
> Drei-Nutzer-Admin-Tool ist „angemeldet = darf in der UI alles" gewollt.

---

## 2. Befund A — `delete_booking_cascade` für `anon` ausführbar

**Status:** im `SECURITY_PERFORMANCE_AUDIT.md` als „⚠️ bewusst offen" dokumentiert.
**Neu:** technische Ursache belegt.

### Was die Funktion tut
`SECURITY DEFINER` (läuft mit Eigentümerrechten, **umgeht RLS**), löscht eine Buchung
**samt 16 verknüpften Tabellen** (service_tasks, linen_orders, guest_preferences, …)
allein anhand der `booking_id`. Keine Prüfung, **wer** aufruft.

### Warum sie offen ist (die Migrations-Historie — das ist der neue Beleg)
| Datum | Migration | Wirkung auf `anon` |
|---|---|---|
| 05.05. | `…a784dd89…` | `GRANT EXECUTE … TO anon, authenticated, service_role` |
| 11.05. | `…03a68c0e…` „Phase 3: Funktionen härten" | `REVOKE EXECUTE … FROM anon, authenticated, public` ✅ |
| **25.05.** | `…a476bef7…` (**eine einzige Zeile**) | `GRANT EXECUTE … TO authenticated, anon` ❌ **hebt die Härtung auf** |

Die Härtung vom 11.05. wurde am 25.05. versehentlich rückgängig gemacht — vermutlich
automatisch erzeugt, weil das Frontend `supabase.rpc('delete_booking_cascade')` aufruft
(`src/hooks/useBookings.ts:98`) und „damit es geht" beiden Rollen Rechte gegeben wurden.
Der Frontend-Aufruf läuft aber als **eingeloggter** Nutzer (`authenticated`) — `anon`
wird **nie** gebraucht.

> Zur Fairness: Die beiden anderen am 11.05. gehärteten Funktionen
> (`update_dynamic_price`, `get_database_size`) blieben korrekt geschützt. Es ist ein
> **isolierter** Fehler, kein Flächenbrand.

### Fix (eine neue Migration, additiv, nichts wird umgebaut)
```sql
-- supabase/migrations/<neuer-timestamp>_revoke_delete_booking_cascade_anon.sql
REVOKE EXECUTE ON FUNCTION public.delete_booking_cascade(uuid) FROM anon, public;
-- 'authenticated' behält das Recht: das Frontend (eingeloggter Admin) ruft es weiter auf.
```
Danach prüfen: `useBookings.ts`-Löschpfad weiterhin testen (eingeloggt → muss gehen).

---

## 3. Befund B — Edge Functions ohne Auth-Check (`verify_jwt = false`)

**Status:** im `Auth-Implementation-Plan.md` als Going-Live-Punkt genannt, aber mit
**veralteten** Function-Namen (`send-gmail`, `insert-tenant-payments` …).
**Neu:** vollständige, klassifizierte Ist-Liste am echten Code.

### Lage
Alle **20** in `config.toml` gelisteten Functions haben `verify_jwt = false` (0× `true`).
Davon prüfen einige **intern** sauber selbst — die sind in Ordnung:

| Function | Eigener Schutz | Bewertung |
|---|---|---|
| `chat-assistant` | `requireAdmin(req)` (`_shared/auth.ts`) | ✅ dicht |
| `daily-pricing` | `CRON_SECRET` + `Authorization`, 401 | ✅ dicht |
| `stripe-webhook` | Stripe-Signaturprüfung | ✅ dicht (muss offen sein) |

**`requireAdmin` existiert bereits** und ist die fertige Vorlage: validiert das JWT via
`getClaims` und prüft `has_role(user,'admin')`, sonst 401/403. Nur `chat-assistant`
nutzt es bisher.

### Die offenen Functions — nach Missbrauchspfad klassifiziert
„Frontend-Treffer" = wird vom eingeloggten UI aufgerufen (sollte also `requireAdmin`
bekommen). „0" = nur intern/cron (sollte `CRON_SECRET` o. ä. bekommen).

#### 🔴 Hohe Priorität — Geld / Mailversand / fremde Secrets
| Function | FE-Aufruf | Risiko bei offenem Zugriff | Empfehlung |
|---|---|---|---|
| `send-guest-email` | 1 | **Mailversand über euer Gmail-Konto** an beliebige Adressen (Absender fix `steinbockchalets@gmail.com`) → Spam/Reputationsschaden | `requireAdmin` |
| `create-payment-link` | 3 | Stripe-Sessions auslösbar (Betrag immerhin serverseitig aus DB — kein Betrugshebel, aber Spam) | `requireAdmin` |
| `generate-tenant-payments` | 0 | erzeugt **Mietzahlungs-Datensätze** (`service_role`), kein Check | `CRON_SECRET` |
| `insert-tenant-payments` | 0 | schreibt Zahlungen | `CRON_SECRET` |
| `external-stammdaten-proxy` | 1 | **offener Proxy** mit eurem `EXTERNAL_LAUNDRY_BEARER_TOKEN` ins fremde Wäscheportal | `requireAdmin` |
| `import-guest-list` | 1 | Massen-Import Gästedaten | `requireAdmin` |

#### 🟠 Mittlere Priorität — KI-Kosten / Datenabfluss-Anstoß
`generate-personalized-email` (2), `generate-guest-profile` (1), `analyze-vacancy` (1),
`booking-analysis` (0), `pricing-engine` (2), `optimize-linen-inventory` (2),
`search-competitors` (1), `scrape-competitor-prices` (2), `add-competitor` (1).
→ Offen = jeder kann **KI-/Scraping-Kosten auf eure Rechnung** auslösen.
FE-gesteuerte → `requireAdmin`; reine Hintergrund-Jobs → `CRON_SECRET`.

#### 🟢 Niedrige Priorität — interne Wäsche-Syncs
`auto-create-linen-orders` (cron), `generate-booking-linen-order`,
`check-booking-linen-orders`, `expand-daily-prices`, `create-cleaning-task-for-booking`,
`sync-linen-order-rest`, `sync-laundry-invoices`, `get-external-order-status`,
`airroi-sync`. → meist intern; `CRON_SECRET` genügt, FE-getriggerte ggf. `requireAdmin`.

### Fix-Muster (zwei Bausteine, beide schon vorhanden bzw. trivial)
1. **User-gesteuerte Functions:** am Anfang von `Deno.serve` einsetzen:
   ```ts
   import { requireAdmin } from "../_shared/auth.ts";
   // nach dem OPTIONS-Check:
   const authError = await requireAdmin(req, corsHeaders);
   if (authError) return authError;
   ```
   Voraussetzung: Frontend ruft mit eingeloggtem JWT auf (tut `supabase.functions.invoke`
   automatisch). Secret `SUPABASE_ANON_KEY` muss in den Function-Secrets gesetzt sein
   (nutzt `requireAdmin` intern).
2. **Cron-/interne Functions:** Header-Secret prüfen (Muster wie `daily-pricing`):
   ```ts
   const cronSecret = Deno.env.get('CRON_SECRET');
   if (req.headers.get('x-cron-secret') !== cronSecret) {
     return new Response('Unauthorized', { status: 401, headers: corsHeaders });
   }
   ```
   Bei pg_cron-Aufrufen den Header in der `net.http_post`-Definition mitsenden.

> **Reihenfolge-Empfehlung:** zuerst die 🔴-Gruppe (Geld/Mail/Token), das sind 6
> Functions und der größte reale Hebel. Der Rest danach in Ruhe.

---

## 4. Logik-Stichproben (Vorgabe „funktioniert die Logik")

Bisher geprüft und **sauber**:
- `create-payment-link`: lädt Beträge **serverseitig** aus `booking_charges`
  (`status='open'`, `payment_id IS NULL`) — kein Betrag aus dem Browser, korrekt gegen
  Manipulation.
- `send-guest-email`: Absender fix aus `GMAIL_USER`, Platzhalter case-insensitive,
  Fehler pro Empfänger gesammelt — wie in `Email-System-Architektur.md` beschrieben.

Noch **offen** für eine zweite Runde (nicht in dieser Sitzung geprüft):
- Query-Logik der Übersichts-Karten (Doppelgänger laut `CODE-INDEX.md` §3) — ob Felder
  über Query/Props korrekt geladen werden (die `.limit()`-ohne-`.order()`-Klasse von
  Bugs, die im Amela-Portal schon auftrat).
- Wäsche-Vorausschau (3 Buchungen) und Reinigungs-Auto-Anlage end-to-end.

---

## 5. Korrektur am `Auth-Implementation-Plan.md` (wichtig)

Dieses Dokument ist **inhaltlich überholt** und sollte einen Hinweis erhalten oder
ersetzt werden, weil es den falschen Ist-Zustand suggeriert:

| Aussage im Plan | Realer Ist-Zustand (belegt) |
|---|---|
| „Keine RLS in der Datenbank – Schutz rein UI-seitig" | **RLS ist aktiviert** (90+ Tabellen, 189 Policies) — siehe `SECURITY_PERFORMANCE_AUDIT.md` |
| Portale `/portal/*` als Routen | Es gibt **kein** Portal-Routing in diesem Repo; Portale sind **eigene Apps** (Amela/Teuni). Hier nur `/`, `/login`, `*`. |
| Going-Live: `verify_jwt=true` für `send-gmail`, `insert-tenant-payments`, … | Function heißt heute **`send-guest-email`**; vollständige aktuelle Liste in Abschnitt 3 |

→ **Empfehlung:** Oben im Plan einen Kasten „⚠️ teilweise überholt — Ist-Zustand siehe
`SECURITY_PERFORMANCE_AUDIT.md` und `Zugriffsrechte-Befunde-2026-06-29.md`" ergänzen.

---

## 6. Handlungsliste (priorisiert)

| # | Maßnahme | Aufwand | Priorität |
|---|---|---|---|
| 1 | Migration: `REVOKE EXECUTE delete_booking_cascade FROM anon, public` | klein | 🔴 |
| 2 | `requireAdmin` in 🔴-Functions (`send-guest-email`, `create-payment-link`, `external-stammdaten-proxy`, `import-guest-list`) | mittel | 🔴 |
| 3 | `CRON_SECRET`-Check in `generate-tenant-payments`, `insert-tenant-payments` | klein | 🔴 |
| 4 | `requireAdmin`/`CRON_SECRET` in 🟠-Gruppe (KI/Scraping) | mittel | 🟠 |
| 5 | `Auth-Implementation-Plan.md` als „teilweise überholt" markieren | klein | 🟠 |
| 6 | 🟢-Gruppe (interne Syncs) absichern | mittel | 🟢 |
| 7 | Logik-Runde 2: Übersichts-Queries + Wäsche/Reinigung end-to-end | größer | 🟢 |

> Diszipliniert nach euren Lessons: Jede dieser Maßnahmen **erst am frisch gelesenen
> Ist-Zustand** der betroffenen Datei umsetzen, dann committen, dann verifizieren.
> Keine Maßnahme „blind" aus dieser Liste — sie ist die Landkarte, nicht der Eingriff.

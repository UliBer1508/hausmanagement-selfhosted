# Konzept: Belegarchiv in OneDrive (Rechnungen scannen, auslesen, ablegen)

> **Stand:** 18.08.2026 · **Status:** entschieden, noch nicht implementiert
> **Repo:** `hausmanagement-selfhosted` · **Supabase:** `usblrulkcgucxtkhugck`
> **Ablage:** `docs/Konzept-OneDrive-Belegarchiv.md`
>
> Dieses Dokument beschreibt eine geplante Erweiterung. Es enthält **keine**
> Aussagen über bestehenden Code. Alle Tabellen, Spalten und Functions darin sind
> **neu** und existieren zum Zeitpunkt der Niederschrift nicht.

---

## 0. Kurzfassung

Rechnungen (Wäsche, Reinigung, Handwerker) werden mit der **OneDrive-Handy-App**
in einen Eingangsordner gescannt. Ein täglicher Cron-Job holt neue Dateien über
die Microsoft-Graph-API, lässt **Gemini** Betrag, Datum und Rechnungsnummer
auslesen, legt einen Datensatz im Status **`entwurf`** an und verschiebt die Datei
in den Jahresordner. Uli prüft den Entwurf in der Hausverwaltung und bestätigt.

**Die Datei bleibt in OneDrive. Die Datenbank hält nur Metadaten und den Verweis.**

Damit gilt dasselbe Muster wie bei Reinigung (`draft`) und Wäsche (`offen`):
Die Automatik schlägt vor, Uli bestätigt.

---

## 1. Getroffene Entscheidungen (nicht neu aufrollen)

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Richtung: OneDrive → App**, nicht App → OneDrive | Das Scannen ist der lästige Teil. Die OneDrive-App kann Auto-Zuschnitt, Mehrseiten-PDF und durchsuchbares OCR bereits besser, als es sich mit vertretbarem Aufwand nachbauen ließe. Die App bekommt nur die Rolle, die sie gut kann: auslesen, prüfen, verknüpfen. |
| E2 | **OneDrive ist der Aufbewahrungsort**, Supabase Storage wird nicht als Zweitablage geführt | Zwei Ablagen bedeuten zwei Wahrheiten. OneDrive ist gesichert, durchsuchbar und mit dem Steuerberater teilbar. |
| E3 | **Delegierter OAuth-Flow über `/consumers`** | Ulis OneDrive hängt an einem **persönlichen** Microsoft-Konto. Persönliche Konten unterstützen **keine** Application Permissions / Client-Credentials. Es gibt keinen anderen Weg. |
| E4 | **Refresh-Token in einer DB-Tabelle**, nicht in einem Supabase-Secret | Microsoft rotiert den Refresh-Token bei jedem Refresh. Supabase-Secrets sind zur Laufzeit nicht schreibbar. |
| E5 | **Ordner-Inhalt abfragen statt `delta`-Token** | Bei einem Eingangsordner mit wenigen Dateien robuster: kein Zustand, der kaputtgehen kann. |
| E6 | KI-Ergebnis wird **Entwurf**, nie automatisch verbucht | Konsistent mit dem übrigen System; Beträge sind zu folgenreich für Blindvertrauen. |

**Verworfen:** Power-Automate-Brücke (Mail mit Anhang → OneDrive). Null Code, aber
es kommt keine `item_id` in die Datenbank zurück — also kein Klick von der Buchung
zum Beleg. Als reines Archiv ausreichend, als integriertes System nicht.

---

## 2. Ordnerstruktur in OneDrive

```
Belege/
  Eingang/                  ← hier hinein wird gescannt, wird vom Job geleert
  2026/
    Waesche/
    Reinigung/
    Sonstiges/
  _Fehler/                  ← Dateien, bei denen die Auslesung scheiterte
```

Der Job legt Jahres- und Kategorieordner bei Bedarf selbst an
(`POST /me/drive/root:/Belege/2026:/children` mit Folder-Facet).

---

## 3. App-Registrierung (einmalig, Azure-Portal)

`entra.microsoft.com` → **Identität → Anwendungen → App-Registrierungen → Neue Registrierung**

| Feld | Wert |
|---|---|
| Name | `Steinbock Belegarchiv` |
| Unterstützte Kontotypen | **Nur persönliche Microsoft-Konten** → Tenant-Wert ist damit fix `consumers` |
| Umleitungs-URI | Plattform **Web**: `https://usblrulkcgucxtkhugck.supabase.co/functions/v1/onedrive-oauth` |

Danach in der App:

1. **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel.**
   Der **Wert** ist nur beim Anlegen sichtbar (die Secret-ID ist etwas anderes).
   Maximale Laufzeit 24 Monate → **Kalendereintrag auf 23 Monate setzen.**
2. **API-Berechtigungen → Microsoft Graph → Delegierte Berechtigungen:**
   `Files.ReadWrite`, `User.Read`, `offline_access`.
   Kein Admin-Consent nötig — Uli bestätigt beim ersten Anmelden selbst.
3. **Übersicht:** Anwendungs-ID (Client-ID) notieren.

> **Fallstrick:** Die `redirect_uri` muss zeichengenau übereinstimmen — Groß-/
> Kleinschreibung, kein abschließender Schrägstrich. Abweichung ergibt
> `AADSTS50011`.

---

## 4. Secrets

```
supabase secrets set MS_CLIENT_ID=... MS_CLIENT_SECRET=... --project-ref usblrulkcgucxtkhugck
```

Der Refresh-Token gehört **nicht** hierher (siehe E4).

---

## 5. Datenbank

### 5.1 `integration_tokens`

```sql
create table public.integration_tokens (
  provider          text primary key,          -- 'onedrive'
  refresh_token     text not null,
  access_token      text,
  access_expires_at timestamptz,
  account_label     text,                      -- verbundene Mailadresse, zur Anzeige
  last_error        text,                      -- z. B. 'invalid_grant'
  updated_at        timestamptz default now()
);
alter table public.integration_tokens enable row level security;
-- BEWUSST KEINE POLICY: damit kommt nur service_role (Edge Functions) heran.
-- Das ist Absicht, kein vergessener Schritt.
```

### 5.2 `documents`

```sql
create table public.documents (
  id                    uuid primary key default gen_random_uuid(),
  doc_type              text not null,          -- 'waesche' | 'reinigung' | 'handwerker' | 'sonstiges'
  doc_date              date,
  vendor                text,
  invoice_number        text,
  amount_net            numeric(10,2),
  amount_vat            numeric(10,2),
  amount_gross          numeric(10,2),
  currency              text default 'EUR',
  house_id              uuid references public.houses(id),
  linen_order_id        uuid references public.linen_orders(id),
  onedrive_item_id      text not null unique,   -- driveItem.id
  onedrive_drive_id     text,
  onedrive_web_url      text,                   -- zum Anklicken in der App
  extraction            jsonb,                  -- Roh-Ausgabe der KI, zur Nachvollziehbarkeit
  extraction_model      text,
  status                text not null default 'entwurf',  -- entwurf | geprueft | verbucht | fehler
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
```

**Zwei Punkte, die später Ärger sparen:**

- **`onedrive_item_id`, nicht der Pfad.** Die `item_id` bleibt beim Umbenennen und
  Verschieben stabil — und verschoben wird ja jede Datei (Eingang → Jahresordner).
  Ein gespeicherter Pfad wäre nach dem ersten Verschieben tot.
- **`unique` auf `onedrive_item_id`** ist der Duplikat-Schutz des Scan-Jobs.
  Gleiches Prinzip wie bei `auto-create-linen-orders`.

RLS: `has_role(auth.uid(),'admin')` für alle Operationen, analog zu den übrigen
Tabellen (127 bestehende Policies nutzen dieses Muster).

> **Vor der Implementierung prüfen:** ob `houses.id` und `linen_orders.id` in
> `src/integrations/supabase/types.ts` genau so heißen. Nicht aus diesem Dokument
> abschreiben, ohne nachzusehen.

---

## 6. Edge Function `onedrive-oauth` (Einmal-Anmeldung)

`verify_jwt = false` — Microsoft ruft ohne JWT zurück. Zwei Pfade in einer Function:

**a) Aufruf ohne `?code`** (Uli öffnet die URL im Browser):
- Zufalls-`state` erzeugen und ablegen
- Weiterleitung (302) auf:

```
https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize
  ?client_id=<MS_CLIENT_ID>
  &response_type=code
  &response_mode=query
  &redirect_uri=https://usblrulkcgucxtkhugck.supabase.co/functions/v1/onedrive-oauth
  &scope=offline_access%20Files.ReadWrite%20User.Read
  &state=<zufall>
```

**b) Aufruf mit `?code`** (Microsoft leitet zurück):
- `state` prüfen — ohne diese Prüfung kann jeder Fremde den Endpunkt anstoßen
- `POST https://login.microsoftonline.com/consumers/oauth2/v2.0/token`
  mit `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`,
  `client_secret`, `scope`
- Antwort enthält `access_token`, `refresh_token`, `expires_in`
- Zeile `provider='onedrive'` schreiben (upsert), `last_error` leeren
- HTML ausgeben: „Verbunden mit uli@… "

**Wirkung:** Der Refresh-Token taucht nirgends in einem Chat, einer Datei oder
einer Zwischenablage auf.

---

## 7. `_shared/onedrive.ts` — Token-Helfer

Eine Funktion `getAccessToken()`, die alle Graph-nutzenden Functions verwenden.
Drei Dinge muss sie richtig machen — jedes davon ist ein bekannter Ausfallgrund:

1. **Access-Token zwischenspeichern.** Gültigkeit 60–90 Min. Liegt
   `access_expires_at` noch >5 Min. in der Zukunft: gespeicherten Token nehmen,
   nicht refreshen.
2. **Den neuen Refresh-Token zurückschreiben.** Microsoft liefert bei jedem
   Refresh einen neuen. Wer den alten stehen lässt, hat irgendwann eine tote
   Verbindung — der Klassiker, an dem solche Integrationen still sterben.
3. **Nebenläufigkeit abfangen.** Zwei Functions, die gleichzeitig refreshen,
   entwerten sich gegenseitig den Token. `pg_advisory_xact_lock` um den Refresh.

Refresh-Aufruf:

```
POST https://login.microsoftonline.com/consumers/oauth2/v2.0/token
grant_type=refresh_token
&refresh_token=<gespeichert>
&client_id=<MS_CLIENT_ID>
&client_secret=<MS_CLIENT_SECRET>
&scope=offline_access Files.ReadWrite User.Read
```

**Fehlerbehandlung `invalid_grant`** (Passwortwechsel, entzogene Zustimmung,
zu lange ungenutzt): `last_error` setzen, Banner „OneDrive-Verbindung erneuern"
in der Hausverwaltung anzeigen, verlinkt auf `/functions/v1/onedrive-oauth`.
Dann ist die Reparatur ein Klick.

---

## 8. Edge Function `onedrive-scan` (Cron, täglich 07:00)

Ablauf:

1. `getAccessToken()` — **vor** jeder „gibt's was zu tun?"-Prüfung aufrufen.
   Grund: Persönliche Refresh-Tokens verfallen bei längerer Nichtnutzung. Der
   tägliche Job hält die Verbindung wach, aber nur, wenn er den Token auch bei
   leerem Eingangsordner anfasst.
2. `GET /me/drive/root:/Belege/Eingang:/children`
3. Je Datei, deren `id` noch nicht in `documents` steht:
   a. Datei über `@microsoft.graph.downloadUrl` laden
   b. an Gemini (`_shared/gemini.ts`) — nimmt PDF und Bild direkt entgegen;
      Antwort als reines JSON anfordern, kein Markdown-Rahmen
   c. `documents`-Zeile als `entwurf` anlegen (`extraction` = Rohantwort)
   d. Datei per `PATCH /me/drive/items/{id}` mit neuem `parentReference.id`
      und `name` in den Zielordner verschieben; `onedrive_web_url` aktualisieren
4. Bei Auslesefehler: Datei nach `Belege/_Fehler/`, Zeile mit `status='fehler'`

Größengrenze: einfacher Download/`PUT …:/content` bis 4 MB, darüber
Upload-Session. Scans liegen praktisch immer darunter.

**Cron-Eintrag** nach dem Muster der bestehenden Jobs (`net.http_post`, Ziel-URL
muss auf `usblrulkcgucxtkhugck` zeigen) — siehe `docs/Migration-Lovable-zu-Selfhosted-Plan.md`,
Abschnitt 2.4, dort ist der Fallstrick „Cron-Jobs leben in der DB" beschrieben.

---

## 9. Betriebsrisiken (die Liste, die man später vergisst)

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Client Secret läuft ab (max. 24 Monate) | alles steht still | Kalendereintrag bei Anlage |
| Refresh-Token nicht zurückgeschrieben | Verbindung stirbt still nach Wochen | Punkt 2 in Abschnitt 7 |
| Passwortwechsel am MS-Konto | `invalid_grant` | Banner + Ein-Klick-Neuanmeldung |
| Zwei parallele Refreshes | Token entwertet | Advisory Lock |
| `redirect_uri` weicht ab | `AADSTS50011` bei der Anmeldung | zeichengenau kopieren |
| Datei nach Verarbeitung nicht verschoben | Endlosschleife bei jedem Lauf | `unique` auf `onedrive_item_id` fängt es ab |

---

## 10. Später — Anschluss an Max

Erst umsetzen, wenn Abschnitte 3–8 laufen und die KI-Bestandsaufnahme
abgeschlossen ist:

- **Werkzeug `search_documents`** — „Was hat Teuni im Juli in Rechnung gestellt?"
  Reines Lese-Werkzeug, damit unkritisch.
- **Wächter-Prüfung „Rechnungsbetrag vs. bestellte Wäschemenge"** — passt in die
  Logik der bestehenden `check_upcoming_bookings`. Meldet an Uli, handelt nicht.
- Beleg-Verweis in der Wäsche-Karte (`onedrive_web_url`), sobald
  `linen_order_id` befüllt wird.

Diese Werkzeuge gehören in die `max_ablaeufe`-Definition, bevor Code entsteht.

---

## 11. Prüfliste zur Umsetzung

- [ ] App-Registrierung angelegt, Kontotyp „nur persönliche Microsoft-Konten"
- [ ] Client Secret erzeugt, Kalendereintrag auf 23 Monate gesetzt
- [ ] Berechtigungen `Files.ReadWrite`, `User.Read`, `offline_access` eingetragen
- [ ] Secrets `MS_CLIENT_ID`, `MS_CLIENT_SECRET` gesetzt
- [ ] Tabellen `integration_tokens` und `documents` angelegt (SQL-Editor, kein `db push`)
- [ ] Spaltennamen `houses.id` / `linen_orders.id` gegen `types.ts` geprüft
- [ ] `onedrive-oauth` deployt, `verify_jwt = false` in `config.toml` eingetragen
- [ ] **Meilenstein:** Callback zeigt „Verbunden mit …", Zeile in `integration_tokens` vorhanden
- [ ] `_shared/onedrive.ts` mit Cache, Token-Rotation, Advisory Lock
- [ ] Extraktions-Prompt an echten Wäscherechnungen erprobt, bevor er in Code gegossen wird
- [ ] `onedrive-scan` deployt, einmal manuell ausgelöst, Ergebnis in `documents` **im Backend** geprüft (nicht nur in der UI)
- [ ] Cron-Job eingetragen, URL zeigt auf `usblrulkcgucxtkhugck`
- [ ] `types.ts` neu generiert (sonst fehlen `documents` und `integration_tokens`)

> Nach Abschnitt 4 ist der schwierige Teil erledigt. Alles danach sind gewöhnliche
> Graph-Aufrufe.

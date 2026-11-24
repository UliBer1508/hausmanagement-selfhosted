# Konzept: Alexa-Skill „Max“ (klassische Alexa, feste Fragen)

Stand: 24.11.2026 · Status: **gebaut** (`supabase/functions/alexa-max/`, `alexa/interaction-model-de-DE.json`) — Skill in der Developer Console anlegen: Abschnitt 4

## 1. Ziel und Entscheidung

Uli soll die Hausverwaltung per Sprache fragen können:

> „Alexa, frag Max, wer diese Woche anreist.“

**Entscheidung 24.11.2026:** gebaut wird **nach dem Vorbild des Heizungs-Skills**
„Meine Heizung“ (Repo `heizung-muenchen`, `doc/ALEXA.md`,
`supabase/functions/alexa-heizung/index.ts`). Der läuft seit 29.10.2026 als
klassischer Custom Skill im Entwicklungsmodus — ohne Veröffentlichung und ohne
Zustimmung von Amazon.

Das Prinzip:

- **Feste Fragen, feste Intents.** Jede Frage hat einen eigenen Intent.
- **Antwort direkt aus der Datenbank.** Die Edge Function liest und baut den Satz
  selbst — **keine KI im Ablauf**. Antwort in Millisekunden, kein Konflikt mit dem
  8-Sekunden-Limit von Alexa.
- **Nur lesend.** Phase 1 ändert nichts, sendet nichts, ruft keine Funktion mit
  Nebenwirkung auf.
- **Max bleibt unverändert.** `chat-assistant` wird nicht angefasst.

Verworfen (Entwurf vom selben Tag): jede Frage über `chat-assistant`/Gemini
schicken. Probleme: Max braucht einen Admin-JWT, mehrere Gemini-Runden passen
nicht sicher in 8 Sekunden, Freitext braucht Intent-Tricks.

Zurückgestellt: **Alexa+ mit MCP** (freie Sprache) — braucht die Zustimmung von
Amazon. Vorlage existiert bereits: `heizung-muenchen/doc/ALEXA-PLUS.md`
(`mcp-heizung`). Wenn Amazon zustimmt, folgt die Hausverwaltung diesem Muster.

**Antrag gestellt 24.11.2026:** Die Alexa+-Konsole zeigt für Ulis Konto „Coming
soon“. Zugang zur Private Preview (MCP Toolkit, `de-DE`, privates Add-on) per
DevAssistant beantragt — **Amazon-Fall 29463522** („Access Request: Alexa+ for
Builders Private Preview (MCP Toolkit)“). Antwort Amazon (24.11.2026, Wilfried
Bassole): an das Private-Preview-Team weitergeleitet, gilt als formaler
Zugangsantrag; Aufnahme in Phasen, das Team meldet sich selbst (auch zu
Einzelentwicklern und `de-DE`). Der Support-Fall wird geschlossen, nichts weiter
zu tun.

## 2. Die sechs Fragen (Uli-Auswahl 24.11.2026)

Haus: ohne Angabe **alle touristischen Häuser** (`houses.rental_type = 'tourist'`,
derzeit nur Wald Chalet). Mit Angabe („… im Wald Chalet“) nur dieses Haus.
Gastnamen **immer über `guests`** (`guests!bookings_guest_id_fkey(name)`), nie
aus den Kopiespalten in `bookings` (laufende Gastdaten-Migration, `AGENTS.md`).

| # | Intent | Beispielsätze (Auswahl) | Datenquelle (geprüft) | Antwort, Beispiel |
|---|---|---|---|---|
| 1b | `NaechsteAnreiseIntent` | „wann die nächsten Gäste kommen“, „wann ist die nächste Anreise“, „wer als nächstes kommt“ | wie 1, aber `check_in >= jetzt`, ohne Zeitgrenze, erste Buchung | „Die nächste Anreise ist am Sonntag, 27. Dezember: Schmenger, Wald Chalet, 6 Gäste.“ |
| 1 | `AnreisenIntent` | „wer diese Woche anreist“, „wer diese Woche kommt“, „welche Anreisen es diese Woche gibt“ | `bookings`: `check_in` von heute bis heute + 6 Tage, `status <> 'cancelled'`, mit `houses(name)`, `guests(name)`, `number_of_guests` | „Diese Woche reist eine Buchung an: Familie Müller, Freitag, 28. November, Wald Chalet, vier Gäste.“ |
| 2 | `ImHausIntent` | „wer gerade im Haus ist“, „wer im {haus} ist“, „ob jemand im {haus} ist“ | `bookings`: `check_in <= jetzt < check_out`, `status <> 'cancelled'`; dazu die nächste Anreise | „Im Wald Chalet ist gerade Familie Müller, Abreise Sonntag. Nächste Anreise: …“ / „Das Wald Chalet ist gerade leer. Nächste Anreise …“ |
| 3 | `ReinigungIntent` | „wann die nächste Reinigung ist“, „wann im {haus} geputzt wird“ | `service_tasks`: `service_type = 'cleaning'`, `scheduled_date >= heute`, `status in ('scheduled','draft')`, sortiert nach Datum/Uhrzeit | „Die nächste Reinigung ist am Sonntag, 30. November, um 10 Uhr im Wald Chalet.“ — bei `draft`: „… ist noch ein Entwurf“ |
| 4 | `WaescheIntent` | „ob die Wäsche bestätigt ist“, „wie es mit der Wäsche aussieht“ | `linen_orders`: `delivery_date >= heute`, `status in ('offen','ausstehend')`, mit `houses(name)`, `bookings(guests(name))` | siehe Abschnitt 2.1 |
| 5 | `AnfragenIntent` | „ob es offene Anfragen gibt“, „ob neue Anfragen da sind“ | `booking_inquiries`: `status = 'pending'` | „Es gibt keine offenen Anfragen.“ / „Es gibt zwei offene Anfragen, die älteste vom …“ |
| 6 | `HeuteIntent` | „was heute ansteht“, „was heute los ist“ | wie `get_daily_overview` in `chat-assistant`: Anreisen, Abreisen (`bookings`), Reinigungen (`service_tasks`), Wäschelieferungen (`linen_orders`) **mit Datum heute** | „Heute: eine Abreise im Wald Chalet, danach Reinigung um 10 Uhr. Keine Anreise, keine Wäschelieferung.“ |

Datenbestand am 24.11.2026 (zur Plausibilität): `bookings.status` ∈
{confirmed, completed, cancelled}; `service_tasks.status` (cleaning) ∈
{scheduled, completed, draft, cancelled}; `linen_orders.status` ∈ {offen,
ausstehend, delivered, cancelled}; `booking_inquiries.status` ∈ {pending,
confirmed, rejected}.

### 2.1 Was heißt „Wäsche bestätigt“? (so umgesetzt 24.11.2026, Bestätigung durch Uli offen)

`linen_orders` hat keine eigene Spalte für eine Bestätigung durch Teuni. Vorschlag
nach der bestehenden Logik (Uli prüft eine Bestellung in der Wäschekarte und
setzt sie auf „ausstehend“ — erst das bestätigt sie und informiert Teuni):

- `offen` → „noch nicht bestätigt — bitte in der Wäschekarte prüfen“
- `ausstehend` → „bestätigt und an Teuni gegangen“
- zusätzlich, falls gesetzt: `external_bestellnummer` → „bei Teuni angekommen“

Vorgelesen werden die nächsten drei Lieferungen, der Rest wird nur gezählt
(„Danach 2 weitere, davon 1 noch nicht bestätigt“).

Antwort, Beispiel: „Zwei Wäschelieferungen stehen an. Freitag, Wald Chalet:
bestätigt. Sonntag, Wald Chalet: noch nicht bestätigt.“

### 2.2 Bewusst NICHT verwendet

- `morning-summary` / `kalender-abgleich`: `morning-summary` ruft
  `kalender-abgleich` auf; der schreibt Zeitstempel
  (`kalender_abgleich_meldungen`, `buchungs_aenderungen`) und verschickt bei
  neuen Befunden eine Mail. **Hinweis:** Der Dateikopf von `kalender-abgleich`
  behauptet „rein lesend“ — das stimmt nicht; der Kommentar sollte korrigiert
  werden (eigener Punkt, nicht Teil dieses Skills).
- `chat-assistant`: siehe Abschnitt 1.

## 3. Bausteine

### 3.1 Edge Function `alexa-max` (neu)

- Datei `supabase/functions/alexa-max/index.ts`, Aufbau wie `alexa-heizung`
  (Einstieg, Prüfung, Intent-Verteiler, je Intent eine Lesefunktion,
  Satzbausteine für Datum/Uhrzeit auf Deutsch, Zeitzone `Europe/Vienna`).
- `supabase/config.toml`: `[functions.alexa-max] verify_jwt = false`
  (Alexa schickt keinen Supabase-JWT).
- Lesen mit `SUPABASE_SERVICE_ROLE_KEY` (stellt Supabase bereit). Nur
  `select`, kein `insert`/`update`/`delete`, kein `functions.invoke`.
- **Prüfungen** (aus `alexa-heizung` übernommen, ergänzt):
  1. `session.application.applicationId` = Secret `ALEXA_SKILL_ID` (Pflicht).
  2. `request.timestamp` höchstens 150 s alt.
  3. `session.user.userId` in Secret `ALEXA_USER_IDS` (wie Heizung; leer = nur
     Skill-ID-Prüfung, für die Ersteinrichtung).
     Abgelehnte Anfragen: HTTP 400, Grund im Log `[alexa-max] abgelehnt: …`.
  4. **Neu gegenüber der Heizung:** Signaturprüfung — Header
     `SignatureCertChainUrl` (https, `s3.amazonaws.com`, Pfad `/echo.api/`),
     Zertifikat gültig mit `echo-api.amazon.com`, Header `Signature-256` gegen
     SHA-256 des rohen Bodys. Ohne diese Prüfung kann jeder, der die Skill-ID
     kennt, Anfragen fälschen. Danach in `alexa-heizung` nachziehen.
- Jede Antwort zusätzlich als `Simple`-Karte in der Alexa-App.
- Fehler: kurzer Satz („Das konnte ich gerade nicht abrufen.“), Technik ins Log.

### 3.2 Interaktionsmodell `alexa/interaction-model-de-DE.json` (neu)

- Aufrufname **`max`** (Uli-Entscheidung 24.11.2026). Einwortige
  Personennamen sind nur für die *Veröffentlichung* unzulässig; im
  Entwicklungsmodus wird `max` getestet. Ausweichlösung bei schlechter
  Erkennung: `hausmax`.
- Intents aus Abschnitt 2, plus `AMAZON.HelpIntent` (zählt die sechs Fragen auf),
  `AMAZON.StopIntent`, `AMAZON.CancelIntent`, `AMAZON.FallbackIntent`
  („Das kann ich noch nicht. Frag mich zum Beispiel, wer diese Woche anreist.“).
- Slot-Typ `HAUS`: „wald chalet“ (Synonyme: „wald“, „waldhaus“),
  „venediger chalet“ (Synonym: „venediger“). Die Function sucht den Namen in
  `houses`, neue Häuser brauchen also nur einen Slot-Wert.

## 4. Einrichtung durch Uli (wie bei der Heizung)

1. Developer Console mit dem Amazon-Konto der Echos → **Create Skill** „Max“,
   German (DE), Custom, Provision your own.
2. JSON Editor → Inhalt von `alexa/interaction-model-de-DE.json` → Save →
   **Build skill**.
3. Endpoint: HTTPS,
   `https://usblrulkcgucxtkhugck.supabase.co/functions/v1/alexa-max`,
   Zertifikat „sub-domain of a domain that has a wildcard certificate“.
4. Skill-ID → Supabase-Secret `ALEXA_SKILL_ID` (Projekt Hausverwaltung).
5. Test → „Development“. Danach „Alexa, öffne Max“ → User-ID aus dem Log →
   Secret `ALEXA_USER_IDS`.

## 5. Dateiliste (Gesamtstand)

| Datei | neu / ändern | Zweck |
|---|---|---|
| `supabase/functions/alexa-max/index.ts` | neu | Alexa-Endpunkt, Prüfungen, sechs Lesefragen |
| `alexa/interaction-model-de-DE.json` | neu | Interaktionsmodell für die Console |
| `supabase/config.toml` | ändern | `[functions.alexa-max] verify_jwt = false` |
| `docs/CODE-INDEX.md` | ändern | neue Function eintragen |
| `docs/Konzept-Alexa-Skill-Max.md` | neu | dieses Dokument |

Secrets: `ALEXA_SKILL_ID`, `ALEXA_USER_IDS`. Deploy: `alexa-max`.

## 6. Testplan

1. Console-Simulator: alle sechs Fragen, je mit und ohne „im Wald Chalet“.
2. Antworten gegen die App vergleichen (Buchungen, Reinigungskarte,
   Wäschekarte, Anfragen) — gleiche Daten, gleiche Gastnamen.
3. Leerfälle: keine Anreise, Haus leer, keine Anfrage → verständlicher Satz.
4. Unbekannte Frage → Fallback-Satz mit Beispiel.
5. Sicherheit: falsche Skill-ID, alter Zeitstempel, fremde User-ID, ungültige
   Signatur → abgelehnt.
6. Erkennung von „max“ auf den Echos über mehrere Tage beobachten.

Automatische Tests (offline, ohne Amazon):

```bash
D=$(mktemp -d) && cd "$D"
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -days 30 -subj "/CN=Test CA" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=keyCertSign"
openssl req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr -subj "/CN=echo-api.amazon.com"
printf "subjectAltName=DNS:echo-api.amazon.com\n" > ext.cnf
openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out leaf.pem -days 10 -extfile ext.cnf
openssl req -x509 -newkey rsa:2048 -nodes -keyout bad.key -out bad.pem -days 10 -subj "/CN=evil" -addext "subjectAltName=DNS:evil.example.com"
printf '{"version":"1.0","request":{"type":"LaunchRequest"}}' > body.json
openssl dgst -sha256 -sign leaf.key body.json | base64 -w0 > sig.b64
cd - && ALEXA_TEST_DIR="$D" deno test -A --no-check supabase/functions/alexa-max/verify.test.ts
```

## 7. Entscheidungen und offene Punkte

- Annahme 24.11.2026 (Vorschlag, von Uli noch nicht ausdrücklich bestätigt): „Wäsche
  bestätigt“ wie Abschnitt 2.1; „diese Woche“ = heute plus sechs Tage.
- Offen: Kommentar im Kopf von `kalender-abgleich` korrigieren (Abschnitt 2.2).
- Offen: Signaturprüfung auch in `alexa-heizung` (Repo `heizung-muenchen`) nachziehen.

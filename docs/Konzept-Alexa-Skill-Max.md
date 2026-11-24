# Konzept: Alexa-Skill „Max“ (klassische Alexa, Custom Skill)

Stand: 24.11.2026 · Status: **Konzept, noch nicht gebaut**

## 1. Ziel und Abgrenzung

Uli soll Max per Sprache fragen können:

> „Alexa, frage Max, wer diese Woche anreist.“

- **Klassischer Custom Skill** über das Alexa Skills Kit (ASK), Sprache `de-DE`.
  Läuft im **Entwicklungsmodus** nur auf den Echo-Geräten von Ulis Amazon-Konto —
  keine Veröffentlichung, keine Zertifizierung.
- **Alexa+ mit MCP ist zurückgestellt** (Entscheidung 24.11.2026): Für Alexa+ for
  Builders ist eine Zustimmung von Amazon nötig, die noch geklärt wird.
- **Max bleibt das Gehirn.** Alexa ist nur Mikrofon und Lautsprecher. Alle
  Fragen laufen durch den bestehenden `chat-assistant` (System-Prompt,
  `max_ablaeufe`, Werkzeuge). Es entsteht **keine zweite Max-Logik**.
- **Phase 1 ist rein lesend.** Max darf über Alexa nichts ändern, nichts senden,
  nichts speichern.

## 2. Ist-Zustand (gelesen 24.11.2026, `main` @ 9fab671)

`supabase/functions/chat-assistant/index.ts` (4 607 Zeilen):

| Punkt | Befund | Folge für Alexa |
|---|---|---|
| Zugang | `requireAdmin(req)` aus `_shared/auth.ts`: verlangt einen Supabase-**Nutzer**-JWT mit Rolle `admin` | Alexa hat keinen Nutzer-JWT → es braucht einen zweiten, internen Zugang (Abschnitt 4.2) |
| Eingabe | `{ messages, context }`, `messages` = `[{role:'user'|'assistant', content}]` | passt — Alexa-Fragen werden als `messages` übergeben |
| Modell | `gemini-2.5-flash` über `_shared/gemini.ts`, Timeout je Aufruf 45 s | ein Aufruf kann allein länger als das Alexa-Limit dauern |
| Werkzeug-Schleife | bis zu 5 Runden, plus einmaliger „Tool-Stupser“ in Runde 1 | mehrere Gemini-Aufrufe hintereinander → Laufzeit ist das Hauptrisiko |
| Ausgabe | Markdown-Text, ggf. mit `___ENTITIES___`-Marker + JSON (Sprung-Buttons) | für Sprache unbrauchbar → Sprachmodus nötig (Abschnitt 4.3) |
| `config.toml` | `[functions.chat-assistant] verify_jwt = false` | Zugangsprüfung liegt also vollständig in `requireAdmin` |

**Werkzeuge nach Wirkung** (Handler in `executeTool` geprüft):

- *Nur lesend* — für Alexa erlaubt:
  `search_booking_inquiries`, `search_bookings`, `search_cleaning_tasks`,
  `search_documents`, `search_houses`, `search_guests`, `search_linen_orders`,
  `get_dashboard_stats`, `get_linen_overview`, `get_booking_full_context`,
  `get_calendar_events`, `get_revenue_stats`, `get_daily_overview`,
  `check_upcoming_bookings`, `list_sperrzeiten`, `read_provider_replies`,
  `get_guest_contact_reminders`, `get_rating_reminders`,
  `get_morning_summary` (ruft `morning-summary` auf — geprüft: schreibt nichts).
- *Schreibend oder nach außen wirkend* — für Alexa **gesperrt**:
  `accept_booking_inquiry`, `reject_booking_inquiry`,
  `create_cleaning_for_booking`, `create_linen_for_booking`,
  `update_linen_for_booking`, `reschedule_cleaning`,
  `reschedule_linen_delivery`, `reject_reschedule`, `update_provider_action`,
  `check_kalender_abgleich` (ruft `kalender-abgleich` auf — geprüft: schreibt
  Meldungen/Zeitstempel, `insert`/`update`/`delete`),
  `send_provider_message`, `save_knowledge`, `draft_guest_welcome_email`
  (folgenlos, aber per Sprache sinnlos).

## 3. Ablauf

```
Echo  ──Sprache──▶  Amazon (Spracherkennung, Intent)
                       │  HTTPS-POST, signiert
                       ▼
        Edge Function  alexa-max   (neu)
          1. Signatur + Zeitstempel + Skill-ID + User-ID prüfen
          2. Frage aus dem Intent zusammensetzen
          3. sofort Zwischenansage („Moment, ich schaue nach.“)
          4. chat-assistant aufrufen  (interner Schlüssel, kanal: 'sprache')
          5. Antwort als Sprache zurück an Alexa
                       │
                       ▼
        chat-assistant  (bestehend, minimal erweitert)
          – nur Lese-Werkzeuge, kurze Sprach-Antwort, kein ENTITIES-Marker
```

## 4. Bausteine

### 4.1 Alexa-Interaktionsmodell (Developer Console, `de-DE`)

- **Aufrufname:** `max` (Uli-Entscheidung 24.11.2026). Einwortige Personennamen
  sind nur für die *Veröffentlichung* unzulässig; im Entwicklungsmodus testen wir
  `max`. Ausweichlösung bei schlechter Erkennung: `hausmax`.
- **Freitext-Feld:** `AMAZON.SearchQuery`. Amazon verlangt dafür in jedem
  Beispielsatz eine **Trägerphrase** um den Platzhalter — ein Beispielsatz nur aus
  `{frage}` wird abgelehnt.
- **Lösung:** je Fragewort ein eigener Intent; `alexa-max` setzt das Fragewort
  wieder vor den Inhalt:

  | Intent | Beispielsätze | rekonstruierte Frage |
  |---|---|---|
  | `WerIntent` | `wer {frage}` | „wer “ + frage |
  | `WasIntent` | `was {frage}` | „was “ + frage |
  | `WannIntent` | `wann {frage}` | „wann “ + frage |
  | `WieIntent` | `wie {frage}`, `wie viele {frage}` | „wie “ / „wie viele “ + frage |
  | `WelcheIntent` | `welche {frage}`, `welcher {frage}`, `welches {frage}` | Fragewort + frage |
  | `GibtEsIntent` | `gibt es {frage}`, `ob {frage}` | „gibt es “ + frage |
  | `AllgemeinIntent` | `nach {frage}`, `zu {frage}`, `bitte {frage}` | frage |

  Dazu die Pflicht-Intents `AMAZON.HelpIntent`, `AMAZON.StopIntent`,
  `AMAZON.CancelIntent`, `AMAZON.FallbackIntent`.
  Ablage: `alexa/interaction-model-de-DE.json` (zum Einfügen im JSON-Editor der
  Console).

### 4.2 Edge Function `alexa-max` (neu)

- `supabase/functions/alexa-max/index.ts`, in `config.toml` mit
  `verify_jwt = false` (Alexa schickt keinen Supabase-JWT).
- **Sicherheit (alles Pflicht, sonst 400):**
  1. Header `SignatureCertChainUrl` prüfen (https, Host `s3.amazonaws.com`,
     Pfad beginnt mit `/echo.api/`, Port 443).
  2. Zertifikat laden, gültig, Subject-Alternative-Name `echo-api.amazon.com`.
  3. Header `Signature-256` gegen SHA-256 des **rohen** Request-Bodys prüfen.
  4. `request.timestamp` höchstens 150 s alt.
  5. `session.application.applicationId` = Secret `ALEXA_SKILL_ID`.
  6. `session.user.userId` = Secret `ALEXA_ALLOWED_USER_ID` (Ulis Konto).
     Den Wert liest Uli beim ersten Testaufruf aus dem Function-Log ab.
- **Aufruf von Max:** `fetch` auf `/functions/v1/chat-assistant` mit Header
  `x-max-internal-key: <Secret MAX_INTERNAL_KEY>` und Body
  `{ messages, context: { kanal: 'sprache' } }`.
- **Rückfragen:** Fragt Max nach („Welchen Gast meinst du?“), bleibt die Sitzung
  offen (`shouldEndSession: false`); der Gesprächsverlauf (höchstens 6
  Nachrichten) wird in `sessionAttributes` mitgeschickt und beim nächsten Satz
  wieder als `messages` übergeben.
- **Antwort:** reiner Text als `PlainText`-Sprache, zusätzlich eine
  `Simple`-Karte in der Alexa-App mit derselben Antwort.

### 4.3 Änderung `chat-assistant` (minimal-invasiv)

1. **Interner Zugang:** Vor `requireAdmin` — ist der Header
   `x-max-internal-key` gesetzt **und** gleich dem Secret `MAX_INTERNAL_KEY`,
   wird die Admin-Prüfung übersprungen. Sonst unverändert `requireAdmin`.
   Vergleich zeitkonstant; fehlt das Secret, ist der interne Zugang aus.
2. **Sprachmodus** (`context.kanal === 'sprache'`, nur zusammen mit dem
   internen Zugang wirksam):
   - Werkzeuge auf die Lese-Liste aus Abschnitt 2 filtern — **Allowlist**, nicht
     Sperrliste, damit neue Schreib-Werkzeuge nie automatisch per Sprache
     erreichbar werden.
   - Zusatz am Ende des System-Prompts: höchstens drei kurze Sätze, kein
     Markdown, keine Listen, keine Links, Datum gesprochen („Freitag, der
     28. November“), Beträge gerundet; bei gewünschten Änderungen sagen, dass das
     nur in der App geht.
   - kein `___ENTITIES___`-Marker in der Antwort.
3. Kein weiterer Umbau, keine Änderung am Verhalten im Web-Chat.

## 5. Laufzeit — das Hauptrisiko

- Alexa bricht ab, wenn der Skill nicht innerhalb von **etwa 8 Sekunden**
  antwortet. Eine **Zwischenansage** (Progressive Response, bis zu fünf pro
  Anfrage) überbrückt die gefühlte Wartezeit, verlängert das Limit aber nicht.
- `chat-assistant` braucht bei Datenfragen typischerweise 2–3 Gemini-Aufrufe
  plus Datenbank. Ob das unter 8 s bleibt, ist **nicht belegt** → wird in
  Phase 1 gemessen (Log-Zeile mit Dauer je Anfrage).
- `alexa-max` bricht den Aufruf nach 6,5 s ab und sagt dann: „Das dauert gerade
  zu lange. Frag mich bitte gleich noch einmal oder schau in die App.“
- Falls zu langsam, Stufe 2 (erst nach Messung entscheiden):
  - im Sprachmodus den „Tool-Stupser“ weglassen und max. 3 Runden;
  - häufige Fragen („wer reist an“, „wer ist im Haus“) direkt auf
    `get_daily_overview` / `check_upcoming_bookings` vorladen;
  - Antwort asynchron in den Max-Chat legen und von Alexa nur ankündigen.

## 6. Datenschutz

- Spracheingabe und gesprochene Antwort laufen über Amazon. Phase 1 ist nur für
  Ulis eigenes Konto freigeschaltet (User-ID-Prüfung).
- Antworten werden im Raum vorgelesen — Gastnamen und Beträge können von
  Anwesenden gehört werden. Uli entscheidet nach dem Test, ob Umsatzfragen
  (`get_revenue_stats`) per Sprache erlaubt bleiben.
- Mieterdaten/Rechtliches: keine eigenen Werkzeuge dafür im Sprachmodus.

## 7. Einrichtung durch Uli (Developer Console)

1. developer.amazon.com mit **demselben Amazon-Konto wie die Echo-Geräte**
   anmelden → Alexa Skills Kit → „Skill erstellen“: Name „Max“, Sprache
   Deutsch (DE), Modell „Benutzerdefiniert“, Hosting „Eigenes Hosting“.
2. Build → JSON-Editor: Inhalt von `alexa/interaction-model-de-DE.json`
   einfügen → Modell speichern und erstellen.
3. Endpoint: HTTPS,
   `https://usblrulkcgucxtkhugck.supabase.co/functions/v1/alexa-max`,
   Zertifikat: „Mein Entwicklungs-Endpunkt ist eine Subdomain einer Domain mit
   Wildcard-Zertifikat“.
4. Skill-ID kopieren → Secret `ALEXA_SKILL_ID`.
5. Test-Tab: Testen auf „Entwicklung“ stellen. Ab dann geht der Skill auf den
   eigenen Echos.

## 8. Dateiliste (Gesamtstand)

| Datei | neu / ändern | Zweck |
|---|---|---|
| `supabase/functions/alexa-max/index.ts` | neu | Alexa-Endpunkt, Prüfungen, Weitergabe an Max |
| `alexa/interaction-model-de-DE.json` | neu | Interaktionsmodell zum Einfügen in die Console |
| `supabase/functions/chat-assistant/index.ts` | ändern | interner Zugang + Sprachmodus (Abschnitt 4.3) |
| `supabase/config.toml` | ändern | `[functions.alexa-max] verify_jwt = false` |
| `docs/CODE-INDEX.md` | ändern | neue Function eintragen |
| `docs/Konzept-Alexa-Skill-Max.md` | neu | dieses Dokument |

Secrets: `ALEXA_SKILL_ID`, `ALEXA_ALLOWED_USER_ID`, `MAX_INTERNAL_KEY`.
Deploy: `alexa-max` und `chat-assistant`.

## 9. Testplan Phase 1

1. Console-Simulator: „frage max wer diese woche anreist“ → richtige Antwort,
   ≤ 3 Sätze, Dauer im Log.
2. Echo: dieselbe Frage; dazu „wann kommt die nächste Wäsche“, „gibt es offene
   Anfragen“, „wer ist gerade im Venediger Chalet“.
3. Rückfrage-Fall: „was ist mit der Buchung von Müller“ (mehrdeutig) → Max fragt
   nach, Antwort im selben Gespräch.
4. Sperre: „verschiebe die Reinigung von …“ → Max sagt, dass das nur in der App
   geht; in der DB ändert sich nichts.
5. Sicherheit: Aufruf ohne gültige Signatur / mit fremder User-ID → 400 bzw.
   „nicht freigeschaltet“; Web-Chat funktioniert unverändert.
6. Erkennung von „max“ über mehrere Tage beobachten; bei Problemen → `hausmax`.

## 10. Offene Punkte

- Laufzeit messen, dann über Stufe 2 entscheiden.
- Ob ein klassischer Skill auf Echos mit aktivem Alexa+ gleich zuverlässig
  aufgerufen wird, im Test beobachten.

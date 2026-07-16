# Session 16.07.2026 — Wäsche-Reschedule-Kette gebaut & Teuni-Bezug repariert

> **Anlass:** Uli meldete, dass sich im Messaging-Widget kein Provider mehr
> auswählen lässt (Dropdown ging nicht auf). Beim Prüfen der Provider-Kommunikation
> fiel auf, dass Teunis Portal-Antworten **keinen Bezug** trugen — der Einstieg in
> die Wäsche-Kette fehlte komplett. Daraus wurde die vollständige
> **Wäsche-Liefertermin-Änderungs-Kette** (`reschedule_linen_delivery`), das
> Gegenstück zur längst existierenden Reinigungs-Kette.
>
> **Arbeitsweise diesmal eingehalten:** Erst `max_ablaeufe` + Doku + echter Code
> gelesen, dann Soll-Definition eingespielt und von Uli geprüft, dann Code gebaut,
> dann **an echten Daten End-to-End getestet** (nicht nur „deployed").

---

## Ausgangsbefund

**Teunis Antworten trugen keinen Bezug.** `usePortalMessages.ts` (Teuni) suchte
beim Senden nach der letzten Max-Nachricht mit `related_task_id` (Reinigungs-Spalte).
Teuni ist aber die Wäsche-Seite — Max' Fragen tragen `related_linen_order_id`. Die
Suche fand nie etwas, Antworten wurden ohne Bezug gespeichert (`related_task_id=null`,
`related_linen_order_id=null`). Der Doppelgänger-Fehler: gleicher Code aus Amela
kopiert, aber falsche Bezugsspalte für den Kontext.

*Amela dagegen war korrekt* — dort ist `related_task_id` die richtige Spalte. Am
Code (nicht angenommen) verifiziert: eine bezugslose Amela-Frage vom 06.07. war ein
**Altfall** aus einer früheren Version von `max-cleaning-reminders`; der heutige Weg
setzt den Bezug korrekt.

---

## Was gebaut wurde (Reihenfolge = Bau-Reihenfolge)

**1. Teuni-Portal-Fix** (`fresh-spin-portal-selfhosted/src/hooks/usePortalMessages.ts`)
Sucht die letzte Max-Nachricht mit IRGENDEINEM Bezug und gibt BEIDE Bezugsfelder
weiter. Live bestätigt: neue Teuni-Antwort trägt jetzt `related_linen_order_id`.

**2. Migration** (`21_max_actions_add_related_linen_order_id.sql`)
`max_actions` um Spalte `related_linen_order_id uuid` (+ FK + Index) erweitert —
symmetrisch zu `related_task_id`. Ohne diese Spalte wäre der Bezug beim
Protokollieren verloren gegangen. **Weg A gewählt** (eigene Spalte), nicht
`related_task_id` überladen — Bedeutung sauber getrennt.

**3. Tool + Handler** (`chat-assistant/index.ts`)
- Tool-Definition `reschedule_linen_delivery` (für Gemini)
- Handler `executeRescheduleLinenDelivery` — exakter Spiegel von
  `executeRescheduleCleaning`, aber `linen_orders`/`delivery_date`/Status `offen`/
  `related_linen_order_id`
- `logMaxAction` um `related_linen_order_id` erweitert (Signatur + Insert)
- `buildEntityLinks`: laundry_order-Button „Wäsche öffnen"
- Dispatcher-Case

**4. Trigger** (`22_max_reschedule_linen_triggers.sql`)
- `trg_aa_notify_teuni_on_linen_release` (NEU) — Spiegel des Amela-notify.
  **Namens-Falle gelöst:** beide Trigger feuern bei `offen→ausstehend`; Postgres
  läuft alphabetisch; das **`aa`-Präfix erzwingt, dass notify VOR close läuft**,
  sonst schlösse close den Vorgang, bevor notify ihn sieht.
- `trg_close_max_action_on_linen_confirmed` (ERWEITERT) — kennt jetzt auch
  `reschedule_linen_delivery`.
- **Doppeldeutigkeits-Schutz:** `offen→ausstehend` gilt auch für NEUE Bestellungen.
  notify_teuni feuert nur, wenn zur Bestellung ein offener
  `reschedule_linen_delivery`-Vorgang existiert.

**5. Reply-Trigger erweitert** (`23_max_provider_reply_linen.sql`) — *der fehlende
Einstieg.* `trg_max_actions_on_provider_reply` reagierte nur auf `related_task_id`.
Teunis Wäsche-Antworten (`related_linen_order_id`) wurden ignoriert → Max erfuhr NIE
von einer Antwort → die Kette hätte am ersten Schritt einen toten Punkt gehabt.
Jetzt behandelt der Trigger BEIDE Bezüge; der Reinigungs-Pfad bleibt unverändert.

**6. KI-Verständnis** (`chat-assistant/index.ts`) — *Test deckte auf, dass Max den
Wunsch nur AUFLISTETE statt anzubieten.*
- `read_provider_replies` erweitert: lädt auch den Wäsche-Bezug, markiert `typ`
  (`reinigung`/`waesche`), Hinweis nennt für Wäsche `reschedule_linen_delivery`.
- Neuer Prompt-Block „📦 WÄSCHE-LIEFERTERMIN VERSCHIEBEN". Danach bot Max korrekt an.

**7. Definition finalisiert** (`24_…finalisieren.sql`)
Alle 6 `reschedule_linen_delivery`-Schritte auf `umgesetzt`; Schritt-6-Trigger-Name
in der `funktion`-Spalte auf den ECHTEN Trigger-Namen `trg_aa_notify_teuni…`
korrigiert (die Kontrollfunktion `max-ablaeufe-pruefen` extrahiert Namen per Regex
`/(?:DB-)?Trigger\s+(\w+)/` und sucht sie in `pg_trigger` — der Funktionsname allein
wurde nicht gefunden). Danach: „26 Schritte geprüft, keine Abweichung."

---

## End-to-End-Test (an echten Daten, Kaloyan Zlateshki / Venediger)

| Glied | Beleg |
|---|---|
| Teuni antwortet → Vorgang `beantwortet` | ✅ Reply-Trigger |
| Max liest & versteht, bietet Verschiebung an | ✅ „Soll ich … von 20.01. auf 22.01. verschieben?" |
| Tool verschiebt → `offen`, `delivery_date=22.01.` | ✅ `updated_at` = Zeitpunkt des „ja" |
| Uli gibt frei (`offen→ausstehend`) → Teuni informiert | ✅ notify-Trigger |
| → Vorgang `abgeschlossen` | ✅ close-Trigger, voller Verlauf |

Testdaten danach zurückgebaut (`25_…aufraeumen.sql`): Kaloyans Termin zurück auf
20.01.2027, Test-Nachrichten/Vorgänge gelöscht.

---

## Nebenbefunde (nicht Bug, aber wichtig)

- **System noch nicht im Realbetrieb.** Amela/Teuni haben nie eine echte Anfrage
  beantwortet; alle Portal-Nachrichten sind Testeingaben. Die Provider-Antwort-
  Buttons existieren nur in einer `.txt`-Sicherung, nicht im aktiven Portal-Code.
  Die Kette funktioniert ohne Buttons (Freitext + Regex + Max' Verständnis).
- **Veraltete Doku korrigiert:** `supabase/SQL/README.md` sprach von einer „bekannten
  Lücke" bei `executeRescheduleCleaning` — seit 13.07. behoben. Jetzt als behoben
  markiert.
- **Messaging-Dropdown:** ging beim Melden nicht auf; nach Neuladen wieder da —
  vermutlich PWA-Cache, kein Code-Bug (Provider-Query + Rendering geprüft, korrekt).

---

## Offen / für später

- **„No answer"-Fall** weiterhin unbehandelt (Provider antwortet gar nicht) — für
  beide Ketten, systemweit.
- Realbetrieb-Einführung von Teuni/Amela (persönlich, wie geplant), bevor die
  Cron-Reminder scharf geschaltet werden.

---

*Erstellt 16.07.2026. Fortführung der Session-Reihe (10.07., 11.07., 13.07.).*

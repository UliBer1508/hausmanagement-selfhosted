# Steinbock Chalets — Gesamtdokumentation (Master-Dokument)

> **Dies ist das zentrale Master-Dokument.** Es fasst das gesamte Projekt zusammen:
> System, Datenmodell, Wäsche-/Reinigungs-Logik, den KI-Assistenten Max, die
> Arbeitsweise und die offenen Punkte. Andere Einzeldokumente in `docs/` können
> nach Übernahme in dieses Dokument gelöscht werden.
>
> **Stand:** 10.07.2026 · **Haupt-Repo:** github.com/UliBer1508/hausmanagement-selfhosted

---

## 1. ÜBERBLICK: WAS IST DAS PROJEKT?

Uli betreibt **Steinbock Chalets** — zwei Ferienobjekte in Österreich (Wald Chalet,
Venediger Chalet). Er hat sich als früherer IT-Profi (27 Jahre Microsoft) ein
selbst-gehostetes System aus mehreren Web-Apps gebaut, die eine gemeinsame
Datenbank teilen und die gesamte Vermietung verwalten.

### Die Apps (alle React/TypeScript/Vite, Vercel-deployed)
| App | Repo | Zweck | Live-URL |
|-----|------|-------|----------|
| **Hausverwaltung** | `hausmanagement-selfhosted` | Ulis Zentrale (enthält Max) | hausmanagement.steinbockchalets-charge.com |
| **Amela-Portal** | `amela-clean-hub-selfhosted` | Reinigung (Amela) | amela.steinbockchalets-charge.com |
| **Teuni-Portal** | `fresh-spin-portal-selfhosted` | Wäsche (Teuni) | teuni.steinbockchalets-charge.com |
| **Heizung/PV** | `smartfox-insight-ai-selfhosted` | Energie-Monitoring | — |
| Marketing-Website | `web-takeover-buddy` | öffentlich, eigene DB | steinbockchalets.com |

**Gemeinsame Datenbank:** Supabase-Projekt `usblrulkcgucxtkhugck`
(Website nutzt separates Projekt `xcohqbdgzprkixeycdhk`).

### Tech-Stack
React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, TanStack React Query,
Supabase (PostgreSQL + Edge Functions), Cloudflare, PWA-fähig.
KI-Modell: **Gemini 2.5 Flash** (via `_shared/gemini.ts`).
Zahlungen: Stripe. E-Mail: denomailer SMTP über `send-guest-email`.

---

## 2. DATENMODELL (Kern-Entitäten und ihre Beziehungen)

Die zentrale Kette: **Buchung → Reinigung → Wäsche**, plus Gäste, Kosten, Zahlungen.

### bookings (Buchung — das Herzstück)
`id, house_id, guest_id, guest_name, check_in, check_out, number_of_guests,
booked_guests, guests_changed_at, status, payment_status, booking_amount, ...`
- **status:** confirmed / checked_in / completed / cancelled
  (completed+cancelled blenden Buchung aus; checked_in zeigt Badge; confirmed normal)
- **payment_status:** paid / unpaid / pending / partial (nur `paid` = bezahlt)
- **booked_guests** = ursprüngliche Gästezahl, **number_of_guests** = aktuelle.
  Nicht verwechseln (wichtig bei Delta-Berechnungen). `guests_changed_at` markiert Änderung.

### service_tasks (Reinigung)
`id, booking_id, house_id, provider_id (→Amela), scheduled_date, scheduled_time,
status, service_type, status_changed_at, ...`
- **status:** scheduled (geplant) / in_progress / completed / delayed / cancelled / **draft**
- Automatische Erstellung setzt Status auf **`draft`** (Entwurf); Uli prüft und
  setzt auf `scheduled` = Bestätigung.

### linen_orders (Wäsche)
`id, booking_id, house_id, provider_id (→Teuni), status, items (JSON), total_items,
delivery_date, external_bestellnummer, ...`
- **status:** offen / bestellt / ausstehend / delivered (=geliefert) / cancelled
- **offen** ist für Teuni unsichtbar; **ausstehend/pending** und **delivered** sind sichtbar.
- Neue Bestellung wird als `offen` angelegt; Uli prüft und setzt auf `ausstehend`.
- Menge wird per Gästezahl berechnet (`calculation_type: per_guest` → Menge = Gäste × Konfiguration).

### provider_messages (Kommunikation mit Dienstleistern)
`id, provider_id, sender_type, message, related_task_id, is_read, created_at`
- **sender_type:** admin (Uli) / provider (Amela/Teuni) / **assistant** (Max)
- **related_task_id** = Bezug zur Reinigung. WICHTIG: hält die Kommunikationskette
  zusammen (siehe Abschnitt 4, Terminänderung).

### Weitere: guests (Stammdaten, Trigger sync_guest_from_booking),
booking_charges (Zusatzforderungen, origin auto_delta/manual),
payments (Stripe-Zahlungen), service_providers (Amela, Teuni),
houses (Objekte mit additional_fees V2: service_fee/tourist_tax/cleaning_fee/
electricity_fee/linen_fee je flat|per_person + vat_percentage).

---

## 3. GESCHÄFTSLOGIK (kritisch zu verstehen)

- **Reinigungen** werden automatisch von der Hausverwaltung pro Buchung erstellt
  (Standard: Check-in-Tag = Samstag-Wechsel). Amela passt Daten nur bei Lücken an.
- **Das Reinigungsdatum ist der Koordinations-Dreh- und Angelpunkt:** Amela setzt es →
  Teuni weiß, wann die Wäsche da sein muss; Teuni trägt Lieferdatum ein → Amela sieht,
  wann die Wäsche kommt.
- **Wäsche-Auto-Bestellung** schaut wegen begrenztem Lager nur die **nächsten 3 Buchungen**
  voraus (konfigurierbar) — nicht bei Buchungserstellung. Läuft täglich 06:00, hält
  max. 3 offene Bestellungen pro Haus vor, Liefertermin X Tage vor Check-in.
- **Gästezahl-Änderung** (händisch durch Uli): löst Zusatzkosten-Berechnung für Tax +
  Bettwäsche aus (implementiert). Reinigung bleibt, aber Wäschemenge muss angepasst werden.
- **Stripe-Zahllinks:** einmal erstellt, sind die Beträge eingefroren (Manipulationsschutz).
- **Zwei Wäsche-Systeme:** (1) **Teuni-Portal** liest direkt aus der internen DB über
  `provider_id = d8110105-8ac9-45e3-ad32-aaf42393744c` (kein Sync nötig).
  (2) **Wäsche Oberpinzgau** hat eigene externe DB, braucht manuellen Sync
  (`external_bestellnummer` gesetzt = synchronisiert).

### Wichtige Komponenten-Fallen (aus Erfahrung dokumentiert)
- Amela: `AmelaBookingInfoCard.tsx` ist die RICHTIGE Karte (via `AmelaEntryRow.tsx`).
  `ConfigurableBookingCard.tsx` (Emoji 🏠, amber) NICHT anfassen.
- Der sichtbare Wäsche-Screen ist `LinenDashboard.tsx` (NICHT das ungenutzte
  `SmartLinenDashboardWithTabs.tsx`).


**z-Index-Falle bei Select-im-Dialog (12.07.2026):** Im `MailPreviewProvider.tsx`
ging das Vorlagen-Dropdown nicht auf (nur blauer Rand, keine Liste). Ursache: Der
`DialogContent` hat `z-[300]`; das Select-Popover (per Portal gerendert) lag mit
`z-50` DAHINTER und war unsichtbar. Lösung:
`<SelectContent position="popper" className="z-[400]">` — höherer z-Index (über dem
Dialog) plus `position="popper"` (sonst schneidet `overflow-y-auto` des Dialogs
das Popover ab).
**Merke:** `modal={false}` am Dialog ist KEINE Lösung — dann wertet der Dialog den
Klick aufs Popover als „Klick nach draußen" und schließt sich.
---

## 4. MAX — DER KI-ASSISTENT (Herzstück der letzten Entwicklung)

Max lebt in der Edge Function `chat-assistant`. Er nutzt einen wachsenden
**Werkzeugkasten** (Tools). Jede Fähigkeit = ein Tool; neue Fähigkeiten kommen
hinzu, ohne Bestehendes anzufassen.

### Grundprinzip für allen Ausbau
- **LESE-Funktionen** (suchen, prüfen, melden) = sicher, jederzeit erweiterbar.
- **HANDEL-Funktionen** (senden, anlegen, ändern) = brauchen "human in the loop":
  Max fragt erst, handelt nach Freigabe. Nie ungefragt bei echten Konsequenzen.
- Ändern/Löschen von Bestehendem ist die riskanteste Klasse → besondere Vorsicht.

### Max' Werkzeuge (Stand 08.07.2026)
**Lesen/Suchen:** search_bookings, search_cleaning_tasks, search_linen_orders,
search_guests, search_houses, search_booking_inquiries, get_calendar_events,
get_daily_overview, get_dashboard_stats, get_linen_overview, get_revenue_stats,
get_booking_full_context (alles zu einer Buchung inkl. "Wäsche liegt nach Reinigung"),
get_morning_summary (vollständige Tagesübersicht in einem Schritt — siehe Abschnitt 4a).

**Buchungsanfragen:** accept_booking_inquiry, reject_booking_inquiry.
**Bulk:** create_bulk_cleaning_tasks, create_bulk_linen_orders.

**Kommunikation:** send_provider_message (schreibt Amela/Teuni; erscheint als
"Max (Assistent)" lila; Terminfragen direkt, Rest als Entwurf zur Freigabe).

**Kontrolle:** check_upcoming_bookings — 4 Wächter-Prüfungen für kommende Buchungen:
(1) fehlende Reinigung, (2) fehlende Wäsche, (3) Wäsche käme nach der Reinigung,
(4) offene Zahlung. Reine Prüfung, meldet an Uli.

**Anlegen (nach Freigabe):** create_cleaning_for_booking (→ Reinigung als `draft`),
create_linen_for_booking (→ löst Wäsche-Automatik aus, Status `offen`).

**Ändern (nach Freigabe):**
- update_linen_for_booking — passt Wäschemenge bei geänderter Gästezahl an
  (ersetzt bestehende Bestellung, egal welcher Status; danach Teuni informieren).
- reschedule_cleaning — verschiebt Reinigung auf neues Datum, setzt Status auf
  `draft`; Uli bestätigt durch Wechsel auf `scheduled`.

**Antworten lesen:** read_provider_replies — liest Amelas/Teunis Antworten und
verknüpft jede über `related_task_id` mit der zugehörigen Reinigung.

### Sonderfall „Reinigung existiert bereits" (NEU 12.07.2026)
Früher legte `create_cleaning_for_booking` IMMER eine neue Reinigung an — auch
wenn für die Buchung schon eine existierte (Gefahr: Doppelanlage).

Jetzt prüft `executeCreateCleaningForBooking` VOR dem Anlegen, ob es zu dieser
Buchung bereits eine Reinigung gibt (`service_tasks`, `service_type=cleaning`,
nicht storniert):
- **Ja** → legt KEINE zweite an, liefert `bereits_vorhanden=true` mit Datum, Haus,
  Status. Max meldet das, fragt „Möchtest du die vorhandene ändern?" und zeigt bei
  „ja" den Button „Vorhandene Reinigung öffnen" (→ EditCleaningTaskDialog).
  Danach läuft alles wie beim Ablauf `reschedule_cleaning`.
- **Nein** → legt wie bisher als `draft` an.
- **Ausnahme:** Nur wenn Uli ausdrücklich eine ZUSÄTZLICHE Reinigung will, ruft Max
  das Tool mit `force=true` auf.

Umgesetzt an vier Stellen in `chat-assistant/index.ts`: Prüfung in der
execute-Funktion, Button in `buildEntityLinks`, `force`-Parameter in der
Tool-Definition, Prompt-Regel „SONDERFALL: REINIGUNG EXISTIERT SCHON".

### Workflow-Kette schließen (DB-Trigger, NEU 12.07.2026)
**Problem:** Legte Max eine Reinigung an, entstand ein `max_actions`-Eintrag mit
`status='wartet_uli'`. Setzte Uli die Reinigung dann auf „geplant", passierte in
`max_actions` NICHTS — der Vorgang blieb ewig offen, die Kette brach ab.

**Lösung:** Trigger `trg_close_max_action_on_cleaning_scheduled` auf `service_tasks`.
Bei `draft → scheduled` (nur Reinigungen) setzt er den offenen Vorgang (`wartet_uli`,
Typ `create_cleaning_for_booking` oder `reschedule_cleaning`, verknüpft über
`related_task_id` oder `booking_id`) auf `abgeschlossen` und ergänzt die Kette um
„Uli hat auf 'geplant' gesetzt". Leert `waiting_for` und `due_at`.

Läuft parallel zu `trg_notify_amela_on_cleaning_release` (gleicher Auslöser, aber
andere Tabelle — kein Konflikt).

### Die geschlossene Terminänderungs-Kette (Kern-Erkenntnis)
Das Zuordnungsproblem "welche Reinigung meint Amela?" wird gelöst, indem die
**Reinigungs-ID durch die ganze Kommunikationskette getragen wird** (relationaler
Bezug, damit die Kette nicht reißt):
1. Max fragt Amela/Teuni + sendet `related_task_id` (die Reinigung).
2. Antwort von Amela/Teuni trägt automatisch dieselbe `related_task_id` mit
   (im Portal-Hook `usePortalMessages.ts`: nimmt die ID der letzten assistant-Nachricht).
3. Uli fragt Max "hat Amela geantwortet?" → Max liest via read_provider_replies
   die Antwort MIT Bezug (Gast, Haus, aktuelles Datum).
4. Max fragt Uli "soll ich verschieben?" → Uli bestätigt.
5. Max führt reschedule_cleaning aus (→ draft) → Uli setzt auf `scheduled`.

**Wichtig:** Max liest Antworten nur auf Nachfrage, handelt nur nach Freigabe.
Das autonome "Max überwacht/reagiert selbst" ist bewusst noch NICHT gebaut.

### Automatik 1: max-cleaning-reminders (Amela)
Eigene Edge Function. Prüft täglich anstehende Reinigungen und fragt Amela, ob der
Termin passt (inkl. Info, ob Wäsche vor der Reinigung geliefert ist).
- Einstellungen in `cleaning_automation_settings`: `max_reminder_enabled`,
  `max_reminder_days_before` (aktuell 3). Einstellungskarte in Reinigungs-Verwaltung.
- Cron `max-cleaning-reminders-daily` (Job-ID 13, täglich 07:00, dry_run:false).
- **STAND: max_reminder_enabled = TRUE** (scharf geschaltet 08.07.; Amela wurde
  eingeführt und hat bereits geantwortet).

### Automatik 2: max-linen-reminders (Teuni)
Gespiegelt: erinnert Teuni, die Wäsche VOR der Reinigung zu liefern — nur wenn noch
nicht geliefert. Eigene Edge Function.
- Einstellungen: `max_linen_reminder_enabled`, `max_linen_reminder_days_before`
  (Standard 5). Einstellungskarte "Max: Wäsche-Erinnerungen an Teuni" im Wäsche-Tab
  (`LinenDashboard.tsx`).
- **STAND (12.07.2026): SCHARF.** `max_linen_reminder_enabled = TRUE`, Vorlaufzeit
  5 Tage, Cron `max-linen-reminders-daily` (07:30) aktiv.

### Automatik 3: overdue-watch (Überfällig-Wächter) — NEU 12.07.2026
Schließt die Lücke „Provider antwortet nicht". Bisher blieb eine unbeantwortete
Terminfrage liegen — niemand erfuhr davon.

- **Edge Function `overdue-watch`** (`supabase/functions/overdue-watch/index.ts`).
- **Was sie tut:** sucht in `max_actions` Einträge mit `status='wartet_provider'`
  UND abgelaufener Frist (`due_at < jetzt`) → setzt sie auf **`ueberfaellig`**,
  ergänzt `last_step` um „X hat nicht geantwortet (fällig war TT.MM.JJJJ)".
- **Fristen:** Max setzt beim Fragen `due_at = jetzt + 2 Tage` (logMaxAction).
- **Sichtbarkeit:** (1) Max-Aktionen-Fenster: rotes Badge „Überfällig"
  (`MaxActionsPanel.tsx`). (2) `morning-summary` zeigt sie ganz oben → Morgen-E-Mail.
- **Cron `overdue-watch-daily`** — täglich **06:15**, VOR der Morgen-Übersicht.
- **Sicherheit:** dry_run ist Standard. Ändert ohnehin NUR den Status in
  `max_actions` — sendet keine Nachrichten, verschiebt keine Termine.
- **STAND: LIVE und scharf.** Am 12.07.2026 im echten Test bewiesen.

### Tagesablauf der Automatik (Stand 12.07.2026)
```
06:15  overdue-watch-daily     → markiert überfällige Vorgänge
06:30  morning-summary-daily   → Tagesübersicht per E-Mail (inkl. Überfällige)
07:00  max-cleaning-reminders  → Amela: „Passt der Termin?"      [SCHARF]
07:30  max-linen-reminders     → Teuni: „Wäsche liefern"         [SCHARF]
```

### Sicherheits-Mechanismen der Automatik (dreifach)
- dry_run (Testlauf) ist Standard — sendet nichts.
- Echtes Senden braucht dry_run:false UND den jeweiligen enabled-Schalter.
- Spam-Schutz: pro Reinigung (related_task_id) höchstens eine Nachricht.

### Portal-Darstellung
Beide Portale zeigen Max-Nachrichten als "Max (Assistent)" (lila) mit
Zeitstempel "Gesendet: TT.MM.JJJJ, HH:MM". Max-Nachrichten zählen im unread-Zähler.

---

## 4a. MORGEN-ASSISTENT & AKTIONEN-FENSTER (umgesetzt 10.07.2026)

### Morgen-/Tagesübersicht — jetzt EINE Quelle der Wahrheit
Früher gab es die Tagesübersicht doppelt: einmal als reiche Frontend-Logik im
Hook `useMorningSummary.ts` (467 Zeilen, lief nur bei App-Öffnung) und die
Einzel-Tools von Max. Das ist zusammengeführt.

- **Edge Function `morning-summary`** (`supabase/functions/morning-summary/index.ts`)
  ist die EINZIGE Quelle. Sie enthält die gesamte Sammel-/Formatier-Logik
  (1:1 aus dem alten Hook portiert: Gästekontakt vor Anreise, Bewertungen mit
  Marketing-Priorität, offene Wäsche, kommende Buchungen 7 Tage, Reinigungen
  heute + kommend, bestätigte Lieferungen).
  - Betriebsart über Body: `{ deliver: false }` = nur Abruf (sendet nichts,
    Standard); `{ deliver: true }` = zusätzlich Zustellung — aber nur wenn
    `system_settings.morning_summary_settings.enabled = true`.
  - Liest optional `morning_summary_settings` und `rating_reminder_settings`;
    fehlen sie, greifen dieselben Defaults wie der alte Hook.
- **Max-Tool `get_morning_summary`** ruft diese Function im Abruf-Modus. Damit
  liefert Max die volle Übersicht auf Anfrage ("Was steht heute an?", "Guten Morgen").
- **Frontend-Hook `useMorningSummary.ts`** wurde von 467 auf 80 Zeilen reduziert:
  er ruft jetzt nur noch die Edge Function auf (keine eigene DB-Logik mehr).
  Schnittstelle unverändert (summaryMessage/isLoading/shouldShow/markAsShown),
  daher `ChatAssistant.tsx` NICHT angefasst. Die Begrüßung beim Öffnen und Max'
  Antwort auf Anfrage kommen jetzt aus DERSELBEN Function.

**Stand (12.07.2026): VOLLSTÄNDIG UMGESETZT UND LIVE.** Alle Bausteine A–E fertig,
im echten Test bewiesen (E-Mail angekommen).

**Proaktive Zustellung (ergänzt 12.07.2026):**
- **Einstellungen:** `system_settings` Schlüssel `morning_summary_settings`
  `{ enabled, time, channel, email_to, include{...} }`. **STAND: enabled = TRUE.**
- **Einstellungskarte** `src/components/Settings/MaxMorningSummaryCard.tsx`
  (Einstellungen-Tab): Not-Aus-Schalter, Empfänger, Uhrzeit. Hook
  `useMorningSummarySettings()` in `useSystemSettings.ts`.
- **Zustellung:** bei `deliver=true` UND `enabled=true` → `send-guest-email`
  (Gmail SMTP), Betreff „Guten Morgen – deine Tagesübersicht".
- **Cron `morning-summary-daily`** — täglich **06:30**.
- **Zwei Sicherheitsgurte (getestet):** Standard ist Abruf-Modus (sendet nichts);
  selbst bei `deliver=true` wird nur gesendet, wenn `enabled=true`.
- **Überfällige Vorgänge:** `morning-summary` liest zusätzlich `max_actions` mit
  `status='ueberfaellig'` und zeigt sie mit HÖCHSTER Priorität ganz oben.

### max_actions — Protokoll aller Max-Transaktionen
- Tabelle `max_actions` (`id, action_type, status, booking_id, guest_name,
  details JSON, created_by, created_at, updated_at`) protokolliert von Max
  ausgeführte Vorgänge (z. B. `welcome_email`).
- Anzeige: `src/components/Chat/MaxActionsPanel.tsx` — reines Protokoll-Fenster
  zum ANSEHEN (kein Prüf-Workflow), gefiltert nach Art und Status. Geöffnet über
  ein Zahnrad-Icon im Chat-Header. Header heißt jetzt "Max, dein AI Assistent"
  (vorher "AI Assistent"). z-index-Falle: Chat liegt auf z-[100], daher
  DialogContent auf z-[200] und SelectContent auf z-[210] gehoben.
- OFFEN zu verifizieren: ob Max ALLE Transaktionstypen (nicht nur welcome_email)
  in max_actions schreibt.

---

## 5. WEITERE SYSTEME (bestehend, ausgereift — Max soll sie NICHT ersetzen)

- **Preisgestaltung:** pricing-engine, daily-pricing, expand-daily-prices,
  analyze-vacancy (nutzt KI), scrape-competitor-prices, search-competitors.
  Regionale Logik (Pinzgau, Sommer-Peak, Samstags-Anreise). → Max könnte diese
  später höchstens ERKLÄREN (lesen/zusammenfassen), nicht ersetzen.
- **E-Mail:** send-guest-email (denomailer SMTP über smtp.gmail.com:465), zentrale
  Vorschau via MailPreviewProvider.tsx. Absender steinbockchalets@gmail.com.
- **Zahlungen:** create-payment-link, stripe-webhook. Live-Key auf Hausverwaltung.
- **Kosten-Delta:** calculate-booking-delta (erkennt Änderungen), generate-tenant-payments.
- **Bundle/PWA:** vite.config manualChunks-Splitting, React.lazy für Tabs,
  version.json + NetworkFirst für PWA-Updates.
- **Länderliste** zentral in `src/lib/countries.ts` (81 Länder; UK statt GB wegen
  bestehender DB-Daten).

---

## 6. ARBEITSWEISE & TECHNIK (für jede weitere Sitzung)

### Prinzipien (nicht verhandelbar)
- **"Erst lesen, dann reden":** immer echten aktuellen Code prüfen, nie aus Annahme bauen.
- **"Done but not really done":** nach jeder Änderung verifizieren (Datei/Zeile/Hash
  oder Live-Verhalten).
- In kleinen, verifizierten Schritten arbeiten.
- **Code-Existenz ≠ aktive Nutzung** — reale Verwendung erfragen.

### Deploy-Wege
- **Edge Functions:** `supabase functions deploy <name> --project-ref usblrulkcgucxtkhugck`
- **Migrationen:** wegen Lovable-Historie-Desync NICHT `db push`, sondern SQL direkt
  im Supabase SQL Editor (dashboard/project/usblrulkcgucxtkhugck/sql/new).
- **Frontend:** GitHub Push → Vercel baut automatisch → hart neu laden.
- **Cron:** im SQL Editor via cron.schedule (nutzt anon-key, kein Service-Role im Repo).
  Beim Ausführen im SQL Editor das Wort "sql" NICHT mitkopieren.

### Git-Workflow (Windows-PC)
- git im PATH: `$env:Path += ";C:\Program Files\Git\cmd"`
- Repo lokal: `C:\hausmanagement\hausmanagement-selfhosted`
- **WICHTIG:** nicht lokal UND direkt auf GitHub mischen → Divergenz. Immer `git pull`
  vor Arbeit. Merge-Konflikt: erst `git diff` verstehen, dann `git checkout --ours`
  (eigene Version) + add + commit --no-edit + push. Nie blind `reset --hard`.
- Repo-Zugriff (public) für Verifikation: codeload-ZIP
  `codeload.github.com/UliBer1508/<repo>/zip/refs/heads/main`.
- `supabase/.temp/` gehört in .gitignore (rutscht sonst in Commits).

### Technik-Eckdaten
- Supabase-Projekt: `usblrulkcgucxtkhugck`
- Teuni-Provider-ID: `d8110105-8ac9-45e3-ad32-aaf42393744c`
- Gemini-API-Key im Secret GOOGLE_GEMINI_API_KEY (beginnt mit 'AIza').
- Tool-Calling nutzt Gemini-spezifisches functionCall/functionResponse-Format
  (`_shared/gemini.ts`) — erschwert zweiten AI-Provider.

---

## 7. OFFENE PUNKTE / AUF DER ROADMAP

### Kurzfristig
- **Absage an Amela (`reject_reschedule`) — NOCH NICHT GEBAUT:** Wenn Amela einen
  neuen Termin vorschlägt und Uli ihn ABLEHNT, gibt es bisher kein Werkzeug, um ihr
  das mitzuteilen und die Reinigung zurückzusetzen. (Der DB-Trigger
  `notify_amela_on_cleaning_release` sendet zwar „Termin konnte leider nicht geändert
  werden", wenn Uli ein ANDERES Datum setzt — aber es fehlt der Fall „gar keine
  Änderung".) In `max_ablaeufe` als 4 rote Zeilen dokumentiert.
- **Wächter zur Automatik** (Weg B): check_upcoming_bookings läuft als Cron mit
  Morgen-Übersicht. Prüflogik (runUpcomingBookingsControl) + Einstellungs-Struktur
  (system_settings key `max_control_settings`: enabled/time/advance_days/checks) sind
  bereits wiederverwendbar vorbereitet.
- **Zahlungs-Prüfung verfeinern:** zwischen 'gar nicht bezahlt' und 'partial' unterscheiden.

### Später (größere Themen)
- **"Max reagiert selbst":** Amelas/Teunis Antworten automatisch (statt auf Nachfrage)
  verarbeiten und proaktiv handeln. Die Kette (related_task_id) ist bereits geschlossen,
  das Sprachverständnis ist kein Problem — offen ist die autonome Ausführung ohne
  Zwischenfreigabe. Bewusst ans Ende gestellt.
- **Änderung bei Check-in-Verschiebung** (analog zur Gästezahl bei Wäsche).
- **Max als Preis-Erklärer** (liest/zusammenfasst vorhandene Preis-Empfehlungen).
- **Zweiter AI-Provider** (größerer Umbau wegen Gemini-spezifischem Tool-Format).

### Bekannte Sicherheits-Punkte (dokumentiert, akzeptiert)
- `delete_booking_cascade` durch eine Migration wieder für `anon` geöffnet.
- Mehrere Edge Functions mit `verify_jwt = false` ohne interne Auth-Checks.
- Public Website mit direktem anon-key-Insert in Hausverwaltungs-DB (langfristig
  durch validierende Edge Function ersetzen).
- Details in `Zugriffsrechte-Befunde-2026-06-29.md`.

---

## 8. WICHTIGE ENTSCHEIDUNGEN (Kontext-Erhalt)

- **Modell A (Antworten):** Amelas/Teunis Antworten gehen an Uli, Uli reagiert.
  Max liest sie nur auf Nachfrage, handelt nur nach Freigabe.
- **Variante A (Terminfragen):** nach Zeitfenster (X Tage vorher, je Reinigung einmal),
  nicht strikt sequentiell — garantiert Vorlauf.
- **Begrüßung:** Max beginnt jede Provider-Nachricht mit "Hallo [Name], ich bin Max,
  der KI-Assistent von Uli."
- **Reinigung neu = draft**, Uli setzt auf geplant. **Wäsche neu = offen**, Uli setzt
  auf ausstehend. Max meldet den Status immer ehrlich.
- **Lovable wird nicht mehr genutzt.** Code-Änderungen über GitHub-Editor oder lokal.

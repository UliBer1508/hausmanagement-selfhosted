# Max — Prompt-Architektur (technischer Aufbau)

> **Maßgebliche Quelle ist immer der Code:** `supabase/functions/chat-assistant/index.ts`.
> Dieses Dokument erklärt, WIE das Prompt-System aufgebaut ist — es enthält
> bewusst NICHT den Prompt-Wortlaut (der würde sonst als zweite Quelle driften).
> Für den inhaltlichen Wortlaut/die Regeln siehe `Max-Prompt-Inhalt.md`.
>
> **Stand:** 10.07.2026 · Zeilennummern beziehen sich auf den damaligen Stand
> und können sich verschieben — als Orientierung, nicht als Fixpunkt.

---

## Grundprinzip: Der Prompt ist NICHT statisch

Früher war der System-Prompt ein fest eingetippter Text. Seit 10.07.2026 setzt
er sich bei **jeder Anfrage neu** aus zwei lebenden Quellen zusammen:

1. **Die aktuelle Datenbank** — echte Häuser, echte Dienstleister, Statuswerte.
2. **Die Lern-Tabelle `assistant_knowledge`** — von Uli beigebrachtes Wissen.

Ändert sich der Betrieb (neues Haus, neuer Dienstleister, neuer gelernter Begriff),
ändert sich Max' Wissen automatisch mit — ohne Code-Änderung, ohne "Training".

Wichtig zur Einordnung: Ein Prompt "lernt" nicht im Sinne von Fine-Tuning. Das
Modell (Gemini 2.5 Flash) bleibt unverändert. Das "Lernen" passiert dadurch, dass
der Code bei jeder Anfrage frisches Wissen aus der DB in den Prompt-Text einsetzt.

---

## Ablauf einer Anfrage (vereinfacht)

1. **Zeitkontext berechnen** (heute, diese/nächste Woche, Monat …) — im Code der
   große Block direkt vor dem Prompt.
2. **Dynamischen Kontext laden** (Block "DYNAMISCHER KONTEXT", ~Zeile 2844):
   - `houses` → Liste "DEINE HÄUSER" (Name, ID, max. Gäste, rental_type)
   - `service_providers` (is_active) → Liste "DEINE DIENSTLEISTER" (Name, alias, ID, service_type)
   - `assistant_knowledge` (is_active) → Liste "GELERNTES WISSEN"
   Alle drei Ladungen sind in try/catch gekapselt: Schlägt eine fehl, läuft der
   Rest weiter (Max funktioniert auch ohne den jeweiligen Block).
3. **System-Prompt zusammensetzen** (`const systemPrompt`, ~Zeile 2910):
   Der feste Regel-Teil + die drei dynamischen Blöcke oben werden zu einem Text.
4. **Werkzeuge bereitstellen** (`getToolDefinitions()`): 28 Tools (Stand 10.07.2026).
5. **Tool-Calling-Schleife** (~Zeile 3080, max. 5 Iterationen):
   Gemini entscheidet, ob und welches Tool es ruft (mode AUTO). Ausnahme:
   Bei erkannter "Begrüßungs-E-Mail"-Absicht wird `draft_guest_welcome_email`
   erzwungen (mode ANY). Tool-Ergebnisse gehen zurück an Gemini, bis eine
   finale Textantwort steht.

---

## Die Werkzeuge (28) — grob gruppiert

Die vollständige, maßgebliche Liste steht im Code (`getToolDefinitions()`).
Grobe Einteilung nach Wirkung:

**Lesen (gefahrlos, schreiben nichts):**
search_bookings, search_cleaning_tasks, search_linen_orders, search_houses,
search_guests, search_booking_inquiries, get_calendar_events, get_daily_overview,
get_dashboard_stats, get_linen_overview, get_revenue_stats, get_booking_full_context,
check_upcoming_bookings, read_provider_replies, get_guest_contact_reminders,
get_rating_reminders, get_morning_summary.

**Handeln — immer mit Rückfrage/Freigabe (human in the loop):**
accept_booking_inquiry, reject_booking_inquiry, create_bulk_cleaning_tasks,
create_bulk_linen_orders, create_cleaning_for_booking, create_linen_for_booking,
update_linen_for_booking, reschedule_cleaning, send_provider_message,
draft_guest_welcome_email, save_knowledge.

**Grundregel Freigabe:** Lese-Tools laufen frei. Handel-Tools fragen zuerst
("Soll ich …?") und handeln erst nach klarem "ja". Bei `send_provider_message`
gilt zusätzlich: nur echte Terminfragen gehen direkt raus, alles andere kommt
als Entwurf zurück.

---

## Das Lernsystem (assistant_knowledge)

- **Tabelle:** `public.assistant_knowledge` (Migration:
  `assistant_knowledge_migration.sql`). Felder: term, meaning, category,
  is_active, created_by, created_at, updated_at. RLS: nur admin (has_role).
  Unique-Index auf lower(term) für aktive Einträge (keine Dubletten).
- **Schreiben:** Tool `save_knowledge` (execute ~Zeile 1037). Prüft, ob der
  Begriff aktiv existiert → aktualisiert, sonst Insert. Wird NUR nach
  ausdrücklichem "ja" von Uli aufgerufen.
- **Lesen:** Beim Kontext-Laden (Schritt 2 oben) landet der Inhalt im Block
  "GELERNTES WISSEN" des Prompts.
- **Zugriff:** Die Edge Function liest/schreibt mit dem Service-Role-Key
  (umgeht RLS) — gewollt, damit Max ohne Nutzer-JWT arbeiten kann.

---

## Wo was liegt (Datei-Landkarte)

- Prompt-Aufbau + alle Tools + Tool-Loop: `supabase/functions/chat-assistant/index.ts`
- Lern-Tabelle: `supabase/migrations/…_assistant_knowledge.sql`
- Morgen-Übersicht (eigene Quelle): `supabase/functions/morning-summary/index.ts`
  (wird von Tool `get_morning_summary` genutzt — siehe MASTER Abschnitt 4a)
- Gemini-Anbindung (Function-Calling-Format): `supabase/functions/_shared/gemini.ts`

---

## Bewusste Grenzen / offene Punkte

- Der dynamische Kontext lädt nur **Stammdaten** (Häuser, Dienstleister, Wissen),
  KEINE Bewegungsdaten (Buchungen, Reinigungen) — die holt Max über Tools.
  Grund: Prompt kurz + günstig halten.
- Jede Anfrage macht dadurch 3 kleine zusätzliche DB-Abfragen. Bei Ulis Volumen
  unkritisch; bei starkem Wachstum evtl. cachen.
- `save_knowledge` schreibt nur bei bestätigtem "ja" — es gibt (noch) keine
  UI zum Bearbeiten/Löschen des gelernten Wissens; das geht aktuell nur per DB.

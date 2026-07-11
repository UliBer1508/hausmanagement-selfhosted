# Session-Dokumentation 10.07.2026 — Max KI-Ausbau

> Zusammenfassung aller heute umgesetzten Änderungen und der offenen Punkte.
> Maßgebliche Quelle bleibt immer der Code im Repo `hausmanagement-selfhosted`.

---

## 1. Was heute umgesetzt wurde

### 1.1 Morgen-Assistent auf Max umgestellt (EINE Quelle der Wahrheit)
**Problem:** Die Tagesübersicht existierte doppelt — als Frontend-Hook
`useMorningSummary` (467 Zeilen) und als Einzel-Tools. Zwei Systeme.

**Gelöst:**
- Neue Edge Function `supabase/functions/morning-summary/index.ts` (553 Zeilen):
  einzige Quelle, Logik 1:1 aus dem Hook portiert. Betriebsarten: `deliver:false`
  (nur Abruf) / `deliver:true` (senden, nur wenn Einstellung enabled).
- Neues Max-Tool `get_morning_summary` in `chat-assistant`: ruft die Function ab.
- Frontend-Hook `useMorningSummary.ts` von 467 → 80 Zeilen reduziert: ruft nur noch
  die Edge Function (keine Doppellogik mehr). Schnittstelle unverändert, daher
  `ChatAssistant.tsx` NICHT angefasst.
- **Status:** deployt und live verifiziert ("Was steht heute an?" liefert die volle
  Übersicht über Max).

### 1.2 Dynamischer, lernender System-Prompt
**Ziel:** Max soll sein Umfeld aus der DB kennen und dazulernen können — ohne
Fine-Tuning.

**Gelöst (in `chat-assistant/index.ts`):**
- Der System-Prompt wird bei jeder Anfrage aus 3 lebenden Quellen aufgebaut:
  echte Häuser (aus `houses`), echte Dienstleister (aus `service_providers`),
  gelerntes Wissen (aus neuer Tabelle `assistant_knowledge`).
- Neue Tabelle `assistant_knowledge` (Migration ausgeführt): term/meaning/category,
  RLS nur admin.
- Neues Tool `save_knowledge`: speichert nach ausdrücklichem "ja" dauerhaft.
  Lern-Ablauf: Max versteht etwas nicht → fragt nach → bietet Speichern an → merkt es.
- **Status:** deployt. "Wann wird Wald gereinigt?" wird jetzt korrekt als Haus
  erkannt (vorher als Gastname missverstanden). Fix dafür: house_id-Auflösung
  direkt in die Tool-Beschreibungen von search_cleaning_tasks/search_linen_orders
  geschrieben ("Hausname NIE in guest_name").
- **Dokumentation:** `Max-Prompt-Architektur.md` + `Max-Prompt-Inhalt.md` (in GitHub).

### 1.3 Max-Aktionen-Fenster (MaxActionsPanel) + Umbenennung
- Header im KI-Chat heißt "Max, dein AI Assistent"; Zahnrad öffnet das Fenster.
- z-index-Fallen gelöst: Chat z-[100], DialogContent z-[200], SelectContent z-[210].
- **Status:** live.

### 1.4 Workflow-Protokoll in max_actions (der große Block heute)
**Ziel:** Jede Max-Aktion als Workflow von Anfang bis Ende verfolgen; erkennen,
wann Max mit Amela/Teuni/Uli kommunizieren muss und ob ein Ablauf durchlief.

**Umgesetzt:**
- **Migration (ausgeführt):** `max_actions` um `related_task_id`, `last_step`,
  `waiting_for`, `due_at` erweitert + Indizes. Einheitliches Statusmodell
  (entwurf/wartet_uli/wartet_provider/wartet_gast/beantwortet/ueberfaellig/
  abgeschlossen/abgelehnt/problem).
- **Stufe 1a — Chat-Aktionen loggen** (in `chat-assistant`): alle Handel-Tools
  schreiben jetzt in max_actions (accept/reject_booking_inquiry, create_cleaning/
  linen_for_booking, update_linen_for_booking, beide Bulk-Tools, send_provider_message
  mit Fortschreiben via related_task_id). Hilfsfunktionen: logMaxAction (erweitert),
  updateMaxAction, appendWorkflowStep.
- **Stufe 1b — Cron-Auslöser loggen:** max-cleaning-reminders, max-linen-reminders,
  auto-create-linen-orders eröffnen den Workflow beim echten Senden/Anlegen
  (action_types: cleaning_termin_check, linen_termin_check, auto_linen_created).
- **Verlaufs-Kette:** logMaxAction legt ersten Schritt in `details.verlauf` an;
  appendWorkflowStep hängt weitere an. So entsteht die Kette in EINER Zeile.
- **Provider-Antwort-Trigger (Migration):** `max_actions_provider_reply_trigger.sql`
  — DB-Trigger auf provider_messages: bei Provider-Antwort (sender_type='provider'
  + related_task_id) wird "X hat geantwortet: …" an die Kette angehängt, Status →
  beantwortet. **Das ist der externe Fortschreib-Punkt.**
- **Panel-Anzeige (Mockup bestätigt & umgesetzt):** MaxActionsPanel zeigt die Kette
  als farbige Pills mit Pfeilen (grün=erledigt, gelb=wartend, rot=Problem),
  Zeitpunkt je Schritt als Tooltip, "Wartet auf … · fällig bis …". Fällt bei
  Alt-Einträgen ohne verlauf auf "Letzter Schritt" zurück.

---

## 2. Deploy-/Einspiel-Status (Stand Ende Session)

In GitHub vorhanden (verifiziert):
- chat-assistant/index.ts — mit appendWorkflowStep, get_morning_summary,
  save_knowledge, dynamischem Kontext ✓
- morning-summary/index.ts ✓
- max-cleaning-reminders, max-linen-reminders, auto-create-linen-orders — mit
  max_actions-Log ✓
- MaxActionsPanel.tsx — mit Ketten-Anzeige (stepStyle) ✓

Migrationen ausgeführt (per SQL-Editor):
- assistant_knowledge (Tabelle) ✓
- max_actions Workflow-Spalten (related_task_id, last_step, waiting_for, due_at) ✓

### NOCH ZU TUN (Deploy):
- [ ] `git pull` lokal, um GitHub-Stand zu holen.
- [ ] `supabase functions deploy chat-assistant --project-ref usblrulkcgucxtkhugck`
      (enthält die Verlaufs-Mechanik — MUSS deployt werden).
- [ ] Cron-Functions deployen, FALLS die 1b-Version noch nicht live ist:
      max-cleaning-reminders, max-linen-reminders, auto-create-linen-orders.
- [ ] **SQL-Trigger ausführen (offen/unbestätigt):**
      `max_actions_provider_reply_trigger.sql` im SQL-Editor. OHNE diesen Trigger
      endet die Kette bei "Amela gefragt" und wächst nicht weiter.
- [ ] Panel: nur Vercel-Build nötig (kein Function-Deploy), da reines Frontend.

---

## 3. Offene Punkte / nächste Schritte

### 3.1 Stufe 2 vervollständigen (Status-Fortschreibung im Chat)
Die Stellen, an denen Max eine Antwort VERARBEITET (Termin ändern nach Amelas
Vorschlag; Uli-Freigabe → Bestätigung an Amela), müssen von logMaxAction auf
appendWorkflowStep umgestellt werden, damit sie die BESTEHENDE Kette fortschreiben
statt eine neue Zeile zu erzeugen. (reschedule bei Z.2698/2733 im chat-assistant.)

### 3.2 FEHLENDE Ablehnung (Absage an Amela)
Der Ablauf "Uli lehnt Terminänderung ab → Absage an Amela" existiert im Code NICHT.
Neues Tool/Flow nötig (reject_reschedule): sendet "Termin kann leider nicht geändert
werden", setzt Reinigung zurück, Kette → abgeschlossen (abgelehnt).

### 3.3 Wächter für "keine Antwort" (Paket 3)
Cron, der offene Workflows prüft: due_at überschritten ohne Antwort → Status
ueberfaellig → in die Morgen-Übersicht ("Amela hat noch nicht geantwortet").
Uli entscheidet dann (keine Auto-Aktion). Baut auf den due_at-Feldern auf, die
1a/1b bereits setzen.

### 3.4 Test-Infrastruktur (weiterhin offen, blockiert Stufe-2-Tests)
Max' Sende-Aktionen (an Amela/Teuni) lassen sich nicht testen, ohne echte Portal-
Nachrichten auszulösen. Kein separates Test-Amela-Frontend vorhanden. Optionen:
Test-Provider in DB / Testmodus-Schalter im Code / separate Test-DB. NICHT gelöst.

### 3.5 Vollständigkeit der Protokollierung prüfen
Verifizieren, dass nach dem Deploy tatsächlich JEDE ausgelöste Aktion mit gefülltem
details.verlauf in max_actions landet (an echten Aktionen testen).

### 3.6 Kleinigkeiten
- Morning-Summary: Reinigungszeit wird mit Sekunden ausgegeben (10:00:00). 1:1 aus
  Frontend übernommen; bei Bedarf in beiden auf HH:MM kürzen.
- Prompt-Anfang hat evtl. eine Dopplung ("Du bist Max…" + alter Satz darunter).

---

## 4. Wichtige verifizierte Fakten (aus dieser Session)
- **Teuni-Provider-ID:** `d8110105-8ac9-45e3-ad32-aaf42393744c` (Endung **ad32**).
  Verifiziert: 11x im Code. Variante ad60 ist FALSCH (0x im Code).
- **Autonomie ist real:** max-cleaning-reminders/max-linen-reminders laufen als Cron
  und fragen Amela/Teuni OHNE Uli-Eingabe (dry_run-Standard schützt; echtes Senden
  nur bei enabled). Das "autonome Max reagiert selbst" ist für diese Reminder also
  bereits aktiv.
- **max_actions wurde vor heute nur an 3 Stellen geschrieben** (welcome_email,
  reschedule_cleaning), ohne Status-Fortschreibung. Das ist jetzt behoben (1a+1b).

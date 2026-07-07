# Max — der KI-Assistent für Steinbock Chalets
## Vollständige Dokumentation: Was gebaut ist, wie es funktioniert, was noch kommt

**Stand:** 07.07.2026
**Haupt-Repo:** https://github.com/UliBer1508/hausmanagement-selfhosted
**Supabase-Projekt:** usblrulkcgucxtkhugck

---

## 1. WAS IST MAX?

Max ist ein KI-Assistent (auf Basis Gemini 2.5 Flash), der über einen wachsenden
"Werkzeugkasten" (Tools) das Vermietungssystem lesen und in Teilen selbstständig
handeln kann. Max lebt in der Edge Function `chat-assistant`. Jede Fähigkeit ist
ein eigenes Tool. Neue Fähigkeiten = neue Tools, ohne Bestehendes anzufassen.

**Grundprinzip (wichtig für allen weiteren Ausbau):**
- LESE-Funktionen (suchen, prüfen, melden) = sicher, jederzeit erweiterbar.
- HANDEL-Funktionen (senden, anlegen, ändern) = brauchen "human in the loop":
  Max schlägt vor / fragt, der Mensch gibt frei. Nie ungefragt handeln bei Dingen
  mit echten Konsequenzen (Nachrichten an Menschen, Geld, Terminänderungen).

---

## 2. DAS SYSTEM, DAS MAX VERSTEHEN MUSS

Drei getrennte Web-Apps, EINE gemeinsame Supabase-Datenbank:
- **Hausverwaltung** (`hausmanagement-selfhosted`) — Uli's Zentrale, enthält Max.
- **Amela-Portal** (`amela-clean-hub-selfhosted`) — Reinigung. Amela sieht hier
  ihre Aufgaben + Nachrichten von Max.
- **Teuni-Portal** (`fresh-spin-portal-selfhosted`) — Wäsche. (Max-Darstellung
  hier noch NICHT nachgerüstet.)

**Zentrale Datenobjekte und ihre Verknüpfung:**
- `bookings` (Buchung) — Herzstück. Felder u.a.: guest_name, check_in, check_out,
  status (confirmed/checked_in/completed/cancelled), payment_status
  (paid/unpaid/pending/partial), booked_guests, number_of_guests, guests_changed_at.
- `service_tasks` (Reinigung) — verknüpft über booking_id. status: scheduled/
  in_progress/completed/delayed/cancelled/draft. provider_id zeigt auf Amela.
- `linen_orders` (Wäsche) — verknüpft über booking_id. status: offen/bestellt/
  ausstehend/delivered/cancelled. ('delivered' = geliefert.)
- `provider_messages` (Nachrichten an Dienstleister) — sender_type: admin/provider/
  assistant. 'assistant' = Max. related_task_id verknüpft mit einer Reinigung.
- `service_providers` — Amela (Reinigung), Teuni (Wäsche).
- `booking_charges`, `payments` — Kosten und Zahlungen.

---

## 3. WAS MAX HEUTE KANN (18 Werkzeuge)

**Lesen/Suchen:**
search_bookings, search_cleaning_tasks, search_linen_orders, search_guests,
search_houses, search_booking_inquiries, get_calendar_events, get_daily_overview,
get_dashboard_stats, get_linen_overview, get_revenue_stats

**Kontext (heute gebaut):**
- `get_booking_full_context` — alles zu einer Buchung auf einmal: Reinigung, Wäsche,
  Kosten, Zahlung, Vorlieben. Erkennt auch "Wäsche liegt nach der Reinigung".

**Buchungsanfragen:**
accept_booking_inquiry, reject_booking_inquiry

**Bulk-Anlage:**
create_bulk_cleaning_tasks, create_bulk_linen_orders

**Nachrichten an Dienstleister (heute gebaut, Etappe 1):**
- `send_provider_message` — Max schreibt Amela/Teuni. Erscheint dort als
  "Max (Assistent)" (lila). Freigabe-Regel: Terminfragen (ist_terminfrage=true)
  gehen direkt; alles andere nur als Entwurf zur Freigabe durch Uli.

**Tägliche Kontrolle / Wächter (heute gebaut, Weg A):**
- `check_upcoming_bookings` — prüft kommende bestätigte Buchungen auf 4 Dinge:
  (1) fehlende Reinigung, (2) fehlende Wäsche, (3) Wäsche käme nach der Reinigung,
  (4) offene Zahlung. Reine Prüfung, meldet an Uli. GETESTET: findet echte offene
  Zahlungen korrekt.

---

## 4. AUTOMATIK: max-cleaning-reminders (heute gebaut + live)

Eigene Edge Function. Prüft täglich anstehende Reinigungen und fragt Amela/Teuni
automatisch, ob der Termin passt — inkl. Info, ob die Wäsche vor der Reinigung da ist.

**Sicherheit (dreifach):**
- Testlauf (dry_run) ist Standard — sendet nichts, zeigt nur.
- Echtes Senden braucht dry_run:false UND max_reminder_enabled=true.
- Spam-Schutz: jede Reinigung wird nur EINMAL gefragt (via related_task_id).

**Steuerung:** Einstellungskarte "Max: Automatische Terminfragen" in der
Reinigungs-Verwaltung (An/Aus-Schalter + Vorlaufzeit-Stepper). Werte in
cleaning_automation_settings: max_reminder_enabled, max_reminder_days_before.

**Cron:** Job 'max-cleaning-reminders-daily', täglich 07:00 (Job-ID 13).
Läuft mit dry_run:false, sendet aber nur wenn max_reminder_enabled=true.

**AKTUELLER STAND:** max_reminder_enabled = FALSE (aus). Vorlaufzeit = 3 Tage.
Cron läuft, sendet aber nichts (Schalter aus). GETESTET im Testlauf: findet
Reinigungen korrekt, formuliert gute Nachrichten mit Wäsche-Info.

---

## 5. WICHTIGE ENTSCHEIDUNGEN (damit der Kontext nicht verloren geht)

- **Nachrichtentext/Begrüßung:** Max beginnt mit "Hallo [Name], ich bin Max,
  der KI-Assistent von Uli."
- **Zeitstempel im Amela-Portal:** Max-Nachrichten zeigen "Gesendet: TT.MM.JJJJ, HH:MM".
- **Modell A (Antworten):** Amelas/Teunis Antworten gehen an Uli, Uli reagiert.
  Max liest/beantwortet Antworten (noch) NICHT selbst. → Zukunftsthema.
- **Variante A (Terminfragen):** nach Zeitfenster (X Tage vorher, je Reinigung
  einmal), NICHT strikt sequentiell — garantiert genug Vorlauf für Amela.
- **Tage-vorher-Steuerung:** zentral in Hausverwaltung. NICHT aus dem Amela-Portal-
  Popup — das liegt nur lokal im Browser (localStorage) und ist für Max unerreichbar.
- **Preisgestaltung:** Es gibt bereits ein ausgereiftes Preis-System (pricing-engine,
  daily-pricing, analyze-vacancy mit KI, Wettbewerber-Scraping). Max soll dieses
  NICHT ersetzen, sondern später höchstens ERKLÄREN/zusammenfassen (nur lesen).

---

## 6. WAS NOCH ZU TUN IST

### Kurzfristig — Max-Automatik scharf schalten (wenn bereit)
1. Einführungsnachricht an Amela senden (über Max im Chat, Uli gibt frei).
   Text: "Hallo Amela! Ich bin Max, der KI-Assistent von Uli für die Steinbock
   Chalets. Ab jetzt melde ich mich manchmal bei dir – z.B. wenn eine Reinigung
   ansteht, und frage, ob der Termin passt. Wichtig: Wenn du mir antwortest, liest
   das Uli und meldet sich bei dir. Bis bald! Max"
2. Prüfen: Vorlaufzeit auf gewünschten Wert (aktuell 3).
3. Scharfschalten: max_reminder_enabled = true (per Einstellungskarte oder SQL).

### Mittelfristig — Wächter zur Automatik ausbauen (Weg B)
Die Prüflogik (runUpcomingBookingsControl in chat-assistant) ist bereits so gebaut,
dass ein Cron sie nutzen kann. Einstellungs-Struktur liegt vorbereitet in
system_settings (Schlüssel 'max_control_settings': enabled, time, advance_days,
checks {missing_cleaning, missing_linen, linen_timing, unpaid}).
Zu tun: eigene Edge Function + Cron + Einstellungskarte, die die Prüfung täglich
läuft und Uli eine Morgen-Übersicht gibt.

### Weitere geplante Wächter/Funktionen
- Gästezahl-Änderung an Teuni melden (booked_guests ≠ number_of_guests,
  guests_changed_at). Teuni muss wissen, ob mehr/weniger Gäste kommen.
- Teuni-Portal: "Max (Assistent)"-Darstellung nachrüsten (wie im Amela-Portal).
- Zahlungs-Prüfung verfeinern: zwischen 'gar nicht bezahlt' und 'partial/angezahlt'
  unterscheiden.

### Später — größere Themen
- "Max antwortet selbst": Max liest Amelas/Teunis Antworten und reagiert (z.B.
  Termin verschieben nach Absprache). Anspruchsvoll, weil natürliche Sprache
  interpretiert werden muss. Bewusst ans Ende gestellt.
- Max als Preis-Erklärer (liest vorhandene Preis-Empfehlungen, fasst sie zusammen).

---

## 7. ARBEITSWEISE & TECHNIK (für jede weitere Sitzung)

**Prinzipien (nicht verhandelbar):**
- "Erst lesen, dann reden" — immer den echten aktuellen Code prüfen, nie aus
  Annahme bauen.
- "Done but not really done" — nach jeder Änderung verifizieren (Datei/Zeile
  oder Live-Verhalten).
- In kleinen, verifizierten Schritten arbeiten.
- Code-Existenz ≠ aktive Nutzung. Reale Verwendung erfragen, nicht aus Code schließen.

**Deploy-Wege:**
- Edge Functions: `supabase functions deploy <name> --project-ref usblrulkcgucxtkhugck`
- Migrationen: wegen Lovable-Historie-Desync NICHT `db push`, sondern SQL direkt
  im Supabase SQL Editor ausführen.
- Frontend (alle Portale): GitHub Push → Vercel baut automatisch → hart neu laden.
- Cron: im Supabase SQL Editor via cron.schedule (nutzt anon-key, kein
  Service-Role-Key im Repo).

**Git-Workflow (Windows-PC):**
- git im PATH: `$env:Path += ";C:\Program Files\Git\cmd"`
- Repo lokal: `C:\hausmanagement\hausmanagement-selfhosted`
- WICHTIG: Nicht lokal UND direkt auf GitHub mischen → führt zu Divergenz.
  Einen Weg wählen (am besten: lokal arbeiten, dann committen + pushen).
  Vor dem Arbeiten immer `git pull`.

**Technik-Eckdaten:**
- KI-Modell: Gemini 2.5 Flash. API-Key im Supabase-Secret GOOGLE_GEMINI_API_KEY
  (muss mit 'AIza' beginnen — ein falscher Key verursachte den 429-Fehler).
- Stack: React/TypeScript/Vite/Tailwind/shadcn + Supabase + Vercel + Cloudflare.
- Doku-Heimat: hausmanagement-selfhosted/docs/

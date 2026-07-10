# Max: Aktionen-Fenster + Umbenennung + Test-Plan

**Datum:** 09.07.2026
**Repo:** `hausmanagement-selfhosted`
**Status:** Umgesetzt und im Portal verifiziert (funktioniert)

---

## 1. Was heute gebaut wurde

### 1.1 Umbenennung des KI-Assistenten
- Header im KI-Modus heißt jetzt **„Max, dein AI Assistent"** (vorher „AI Assistent").
- Begrüßungstext im leeren Chat: **„Hallo! Ich bin Max, dein Assistent."** (vorher „Hallo! Ich bin dein AI-Assistent.").
- Datei: `src/components/Chat/ChatAssistant.tsx`

### 1.2 Zahnrad-Icon im Header
- Rechts neben dem Titel „Max, dein AI Assistent" (nur im KI-Modus, `chatMode === 'ai'`).
- Icon: `Settings` aus `lucide-react`.
- Klick öffnet das neue Max-Aktionen-Fenster (`setIsMaxActionsOpen(true)`).

### 1.3 Neues Fenster: MaxActionsPanel
- **Neue Datei:** `src/components/Chat/MaxActionsPanel.tsx`
- **Zweck:** Reines **Protokoll zum Ansehen** – zeigt alle von Max ausgeführten
  Transaktionen (E-Mail geschrieben, Termin geändert, Wäsche angepasst usw.)
  mit ihrem aktuellen Status. **Kein** Prüf-Workflow, keine Eingriffs-Buttons.
- **Datenquelle:** Tabelle `max_actions` (Supabase), Spalten:
  `id, action_type, status, booking_id, guest_name, details, created_by, created_at, updated_at`.
- **Funktionen:**
  - Liste aller Einträge, neueste zuerst (Limit 200).
  - Filter nach **Art** (`action_type`) und **Status** – beide Filter füllen sich
    automatisch aus den vorhandenen Werten.
  - Anzeige pro Eintrag: Klartext-Label der Art, Gast, Zeitstempel (TT.MM.JJJJ, HH:MM),
    `created_by`, Status-Badge, JSON-Details (z. B. Empfänger, Betreff, Haus),
    optional „Aktualisiert"-Zeitpunkt.
  - „Aktualisieren"-Knopf (RefreshCw) lädt neu.

---

## 2. Gelöste Probleme (Stacking / z-index)

Das Chat-Fenster liegt auf `z-[100]`. Der shadcn-Dialog liegt standardmäßig auf `z-50`.
Dadurch traten nacheinander drei Probleme auf, alle in `MaxActionsPanel.tsx` gelöst:

1. **Fenster lag hinter dem Chat** → `DialogContent` auf `z-[200]` gehoben.
2. **Selectboxen nicht auswählbar** (Dropdowns klappten hinter den Dialog) →
   beide `SelectContent` auf `z-[210]` gehoben.

Die globale `src/components/ui/dialog.tsx` und `src/components/ui/select.tsx`
wurden **bewusst NICHT** angefasst (werden portalweit genutzt) – die z-index-Werte
sind lokal per `className` in `MaxActionsPanel.tsx` gesetzt.

---

## 3. Offene / noch zu prüfende Punkte

### 3.1 RLS auf `max_actions` (prüfen)
Falls das Fenster leer bleibt, obwohl Zeilen existieren: SELECT-Policy für
eingeloggte Nutzer fehlt vermutlich. Prüf-SQL:
```sql
select relrowsecurity as rls_aktiv from pg_class where relname = 'max_actions';
select policyname, cmd, roles from pg_policies where tablename = 'max_actions';
```
Stand heute: Fenster zeigt Einträge → SELECT funktioniert aktuell.

### 3.2 Vollständigkeit der Protokollierung (prüfen)
Beide bekannten Beispielzeilen sind `welcome_email`. **Noch nicht verifiziert**,
ob Max ALLE Transaktionen (Termin-Änderung, Wäsche-Anpassung, Provider-Nachricht)
in `max_actions` schreibt. Falls nicht: in den betreffenden Edge Functions ein
`INSERT INTO max_actions` ergänzen. → Aufgabe für einen der nächsten Tage.

### 3.3 Dialog-Overlay (kosmetisch, niedrige Priorität)
Der abdunkelnde Hintergrund (Overlay) bleibt auf `z-50` und legt sich evtl. nicht
über das Chat-Fenster. Falls störend: Panel vom shadcn-Dialog auf ein eigenes
Overlay umstellen (räumt alle Stacking-Themen endgültig auf). Aktuell nicht nötig.

---

## 4. Test-Plan für morgen (NUR Notiz, noch nicht gebaut)

**Ziel:** Alle Max-Funktionen testen, OHNE über die Portale (Amela/Teuni) kommunizieren zu müssen.

**Gewählter Ansatz: Option 3 – eigene Test-Oberfläche.**
- Eigenständiges HTML-File (läuft lokal im Browser, kein Deploy nötig).
- **Login per E-Mail/Passwort** (Weg B): holt das Admin-JWT automatisch über den
  öffentlichen `anon`-Key; erneuert bei Ablauf automatisch. Kein manuelles
  JWT-Kopieren nötig.
- **Aufbau (3 Bereiche):**
  1. Login-Feld (E-Mail/Passwort).
  2. Chat gegen `chat-assistant` – exakt wie das Portal (`{ messages, context }`),
     mehrstufiger Dialog, um „erst fragen, dann ausführen" zu prüfen.
  3. Live-DB-Ansicht der betroffenen Zeilen (ausgewählte Buchung, `linen_orders`,
     letzte `provider_messages`, `max_actions`) mit „Neu laden" – zur „done but not
     really done"-Kontrolle nach jedem Max-Aufruf.

**Voraussetzungen, die morgen bereitliegen müssen:**
- Öffentlicher **`anon`-Key** (aus Supabase → Project Settings → API, oder aus
  `src/integrations/supabase/client.ts`). Kein Geheimnis.
- Function-URL: `https://usblrulkcgucxtkhugck.supabase.co/functions/v1/chat-assistant`

**Sicherheitshinweise fürs Testen:**
- `send_provider_message` kann ECHTE Nachrichten an Teuni/Amela auslösen.
- Deshalb: **Testmodus-Schalter** einbauen und mit einer klar benannten
  **Testbuchung** arbeiten (z. B. Gast „TEST Wäsche").
- Es wird gegen die echte Produktions-DB getestet – vorsichtig sein.

---

## 5. Dateien, die heute in GitHub kopiert wurden
- `src/components/Chat/ChatAssistant.tsx` (ersetzt)
- `src/components/Chat/MaxActionsPanel.tsx` (neu)

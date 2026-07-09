# Prozess: Reinigungstermin ändern & Amela bestätigen

Stand: 09.07.2026 · Betrifft: `hausmanagement-selfhosted` (Max / chat-assistant),
`amela-clean-hub-selfhosted` (Amela-Portal), Supabase (`service_tasks`,
`provider_messages`).

Dieses Dokument beschreibt den **abgestimmten Soll-Prozess** und wie er im Code
umgesetzt ist. Es ist die zentrale Referenz für den Reinigungs-Änderungsablauf.

---

## Grundprinzip: die Reinigungs-ID (`related_task_id`) steuert alles

Jede Kommunikation zwischen Max und Amela zu einer Reinigung trägt die
`related_task_id` — die eindeutige ID der Reinigung. Dadurch ist immer klar,
um welche Reinigung es geht, ohne Raten.

- Max fragt Amela: „Passt der Termin am TT.MM.?" → `provider_messages`,
  `sender_type='assistant'`, `related_task_id` gesetzt.
- Amela antwortet strukturiert (feste Buttons im Portal):
  - „Ja, der Termin passt." (Zustimmung, keine Änderung)
  - „Neuer Termin: TT.MM.JJJJ" (echter Änderungswunsch)
  - Beide Antworten übernehmen dieselbe `related_task_id`.

---

## Der vollständige Ablauf

### Fall 1: Amela wünscht eine Änderung

1. **Amela** schickt „Neuer Termin: 17.07.2026" (mit `related_task_id`).
2. **Max** ändert die Reinigung auf das neue Datum und Status **`draft`**
   (deutsch: „📝 Entwurf"). Er meldet im Chat „Änderung durchgeführt (Entwurf)"
   und zeigt einen **Button „Reinigung für … öffnen"**.
   → Amela wird an dieser Stelle **NICHT** informiert.
3. **Uli** klickt den Button → die **Reinigungskarte** öffnet sich direkt im
   Edit-Dialog, Status gelb als „Entwurf" hervorgehoben.
4. **Uli** prüft. Er kann das Datum in der Karte bei Bedarf **noch ändern**.
   Dann setzt er den Status auf **„Geplant"** (`scheduled`) und speichert.
5. **Automatisch (DB-Trigger)** wird Amela jetzt informiert:
   - Gespeichertes Datum **=** Amelas Wunsch → „Der Reinigungstermin wurde auf
     TT.MM.JJJJ geändert. Danke für den Hinweis!"
   - Gespeichertes Datum **≠** Amelas Wunsch (Uli ist abgewichen) → „Der Termin
     konnte leider nicht geändert werden."
   - Die Bestätigung trägt wieder die `related_task_id`.
6. **Vorgang abgeschlossen.**

### Fall 2: Amela stimmt zu („Termin passt")

- Amela antwortet „Ja, der Termin passt." → kein Änderungswunsch.
- Es wird nichts geändert, und beim (etwaigen) Freigeben wird **nichts** an
  Amela gesendet. Der Trigger reagiert nur auf „Neuer Termin: …".

### Fall 3: Uli ändert selbst (ohne Amela-Wunsch)

- Uli sagt Max direkt „ändere Reinigung von Niels auf 17.7.".
- Max ändert auf `draft`, zeigt den Karten-Button. Uli gibt frei.
- Da es zu dieser Reinigung **keine** Amela-„Neuer Termin"-Antwort gibt,
  sendet der Trigger **nichts** an Amela. Korrekt — der Wunsch kam von Uli.

---

## Wichtige Regeln (bewusst so entschieden)

- Die Amela-Bestätigung geht **erst nach der Freigabe** (draft → scheduled)
  raus, **nie** schon beim Ändern.
- Amela wird **nur** benachrichtigt, wenn sie zu genau dieser Reinigung einen
  echten Änderungswunsch („Neuer Termin: …") gestellt hat.
- Weicht Uli beim Freigeben von Amelas Wunschdatum ab, bekommt Amela nur
  „konnte leider nicht geändert werden" — **ohne** Nennung eines anderen Datums.
- `draft` ist ein echter, bereits gespeicherter Zustand — kein reiner Vorschlag.
  Die Freigabe (draft → scheduled) ist der Abschluss.

---

## Technische Umsetzung (wo liegt was)

| Baustein | Ort | Status |
|---|---|---|
| Reschedule auf `draft` | `chat-assistant/index.ts` → `executeRescheduleCleaning` | vorhanden |
| Karten-Button im Chat | `chat-assistant/index.ts` → `buildEntityLinks` (`cleaning_task`) + Pfade A/B | **neu (Änderung A)** |
| Verfrühte Amela-Bestätigung entfernt | `chat-assistant/index.ts` → Pfad B | **neu (Änderung B)** |
| Reinigungskarte öffnen | `ChatMessage.tsx` (`cleaning_task` → `openTaskId`) + `CleaningManagement.tsx` | vorhanden |
| Status auf „Geplant" | `EditCleaningTaskDialog.tsx` (Status-Dropdown) | vorhanden |
| Amela-Bestätigung nach Freigabe | DB-Trigger `notify_amela_on_cleaning_release` auf `service_tasks` | **neu (Migration)** |

### Status-Werte (`task_status` ENUM)
`draft` (Entwurf) · `scheduled` (Geplant) · `in_progress` · `completed` ·
`cancelled` · `delayed`

### Warum ein DB-Trigger (und nicht Frontend)
Die Regel „wenn Status draft→scheduled wechselt, dann ggf. Amela informieren"
ist eine **Datenregel**, keine UI-Regel. Der Trigger greift deshalb IMMER —
egal ob Uli über die Chat-Karte, die Reinigungsverwaltung oder anderweitig
freigibt. Der Edit-Dialog musste dafür nicht verändert werden.

---

## Bekannte Grenzen / offene Punkte

- Der Trigger erkennt Amelas Wunsch am festen Text „Neuer Termin: TT.MM.JJJJ".
  Ändert sich dieses Format im Amela-Portal (`PortalChat.tsx`,
  `handleTerminChange`), muss das Muster im Trigger mitgezogen werden.
- Die Tabelle `max_actions` protokolliert weiterhin, wird aber nirgends
  ausgewertet. Für diesen Prozess ist sie nicht erforderlich; ein späteres
  „Auftragsverlauf"-UI könnte sie nutzen.

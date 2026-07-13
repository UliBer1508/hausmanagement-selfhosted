# supabase/sql — Datenbank-Logik im Klartext

> **Warum es diesen Ordner gibt:** Die Kernlogik von Max lebt zu einem großen Teil
> in **DB-Triggern**, nicht im Anwendungscode. Diese Trigger wurden bisher nur per
> Supabase SQL-Editor ausgeführt und existierten in **keiner** Repo-Datei. Damit war
> die wichtigste Logik des Systems nirgends nachlesbar, nicht versionierbar und im
> Ernstfall nicht wiederherstellbar. Dieser Ordner behebt das.
>
> **Stand:** 13.07.2026 · aus der Produktions-DB (`usblrulkcgucxtkhugck`) gezogen.

---

## Warum nicht `supabase/migrations/`?

Weil die Migrations-Historie durch die Lovable-Zeit **desynchron** ist. Ein
`supabase db push` gegen diese Historie ist riskant (siehe MASTER, Abschnitt 6:
*„wegen Lovable-Historie-Desync NICHT `db push`"*).

Dieser Ordner ist deshalb **Referenz und Wiederherstellung**, kein Migrations-Runner.
Alle Dateien sind **idempotent** (`CREATE OR REPLACE`, `DROP … IF EXISTS`,
`IF NOT EXISTS`) und können jederzeit erneut im **SQL-Editor** ausgeführt werden,
ohne Schaden anzurichten.

---

## Reihenfolge

Bei einer Wiederherstellung von null in dieser Reihenfolge ausführen:

| # | Datei | Inhalt |
|---|-------|--------|
| 01 | `01_max_tables.sql` | Tabellen `max_actions`, `max_ablaeufe`, `assistant_knowledge` |
| 10 | `10_max_notify_amela_on_cleaning_release.sql` | Freigabe einer Reinigung → Amela benachrichtigen |
| 11 | `11_max_close_actions.sql` | Drei Trigger, die Max-Vorgänge abschließen |
| 12 | `12_max_provider_reply.sql` | Provider-Antwort → Workflow-Kette fortschreiben |

Die Lücke zwischen 01 und 10 ist Absicht — Platz für weitere Tabellen/Constraints.

---

## Das Gesamtbild: wie die Kette funktioniert

Der Kern des ganzen Systems ist **eine ID**: `related_task_id` (= die ID der
Reinigung). Sie wird durch die gesamte Kommunikation getragen und löst damit das
Problem „welche Reinigung meint Amela eigentlich?" — ohne Raten, ohne Textsuche.

```
  Max fragt Amela                    [Code: send_provider_message]
        │  provider_messages, sender_type='assistant', related_task_id=X
        │  max_actions: status='wartet_provider', due_at=+2 Tage
        ▼
  Amela antwortet                    [Amela-Portal, feste Buttons]
        │  provider_messages, sender_type='provider', related_task_id=X  ← dieselbe ID
        ▼
  ⚡ TRIGGER 12  max_actions_on_provider_reply
        │  hängt "Amela hat geantwortet: …" an die Kette
        │  status → 'beantwortet', due_at → NULL
        ▼
  Uli lässt Max verschieben          [Code: reschedule_cleaning]
        │  service_tasks: neues Datum, status='draft'
        ▼
  Uli setzt auf "Geplant"            [Edit-Dialog]
        │  service_tasks: draft → scheduled
        ├──────────────────────────────┐
        ▼                              ▼
  ⚡ TRIGGER 10                   ⚡ TRIGGER 11
  notify_amela_on_               close_max_action_on_
  cleaning_release               cleaning_scheduled
        │                              │
   Bestätigung an Amela          Vorgang → 'abgeschlossen'
   (nur wenn SIE gefragt hatte)
```

**Beide Trigger auf `service_tasks` feuern beim selben Ereignis** (draft→scheduled),
schreiben aber in **verschiedene Tabellen** — kein Konflikt.

Parallel dazu läuft der **Überfällig-Wächter** (Edge Function `overdue-watch`,
Cron 06:15): Er sucht Vorgänge mit `status='wartet_provider'` und abgelaufenem
`due_at` und setzt sie auf `ueberfaellig`. Sie erscheinen dann rot im
Max-Aktionen-Fenster und ganz oben in der Morgen-E-Mail.

---

## ⚠️ Bekannte Lücke (Stand 13.07.2026)

**`reschedule_cleaning` schreibt keinen `max_actions`-Eintrag.**

Trigger 11 sucht bei `draft → scheduled` einen offenen Vorgang vom Typ
`create_cleaning_for_booking` **oder `reschedule_cleaning`**. Der Code in
`chat-assistant/index.ts` (`executeRescheduleCleaning`) ruft aber **kein**
`logMaxAction` auf — verifiziert am Code, nicht vermutet.

**Folge:** Verschiebt Max einen Termin, entsteht kein Vorgang. Trigger 11 findet
nichts zu schließen. Die Kette bricht — nicht theoretisch, sondern zwangsläufig.

Der Trigger ist korrekt. Der fehlende Teil liegt **im Code**. → Zu beheben in
`executeRescheduleCleaning`.

---

## ⚠️ Nicht aus der DB verifiziert

Ehrlichkeitshalber: Diese Teile der Dateien sind **rekonstruiert**, nicht
1:1 aus der DB gezogen:

- **RLS-Policies** — nach Projektkonvention angenommen (`authenticated`, voller Zugriff)
- **Indizes** auf `max_actions`
- **Primary Keys**

Die **Trigger-Funktionen und Trigger selbst sind wörtlich** aus
`pg_get_functiondef()` / `pg_get_triggerdef()` übernommen — die stimmen exakt.

Prüf-SQL, falls du die Policies verifizieren willst:

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where tablename in ('max_actions','max_ablaeufe','assistant_knowledge');

select tablename, indexname, indexdef
from pg_indexes
where tablename in ('max_actions','max_ablaeufe','assistant_knowledge');
```

Weichen die Ergebnisse ab: **die DB gewinnt**, Datei danach korrigieren.

---

## Weitere Trigger in der DB (hier NICHT abgelegt)

Die Produktions-DB enthält ~70 Trigger. Dieser Ordner deckt bewusst nur die
**Max-Logik** ab. Nicht enthalten, aber vorhanden:

- `sync_guest_from_booking` — Gast-Stammdaten aus Buchung ableiten
- `sync_*_to_houses` — JSONB-Spiegelung von Ausstattung/Preisen/Wäschebestand
- `create_draft_invoice_for_linen_order` — Entwurfsrechnung bei Wäschebestellung
- `notify_booking_guest_count_change` — Gästezahl-Änderung melden
- diverse `update_*_updated_at` — Zeitstempel-Pflege

**Zwei Auffälligkeiten, die beim Ziehen aufgefallen sind** (nicht geändert,
nur notiert):

1. **Doppelter Trigger auf `bookings`:** `sync_booking_guest_trigger` **und**
   `sync_guest_on_booking_change` rufen **beide** `sync_guest_from_booking()`
   auf, beide `BEFORE INSERT OR UPDATE`. Die Funktion läuft also doppelt.
   Vermutlich harmlos (der zweite Lauf findet den im ersten gesetzten `guest_id`),
   aber ein Kandidat für Gäste-Dubletten. **Nicht angefasst** — Gästedaten sind heikel.

2. **anon-key im Funktionstext:** `trigger_translate_new_activity()` enthält den
   Supabase-anon-key hartcodiert. Öffentlich und damit kein Geheimnis im engeren
   Sinn — aber unsauber. Diese Funktion ist hier **absichtlich nicht abgelegt**,
   damit der Key nicht ins Repo wandert.

## Problem-Analyse

**1. Falsche Gäste-Auswahl (Luca & Kristina)**
Der Hook `useRebookingScore.ts` lädt **alle** Buchungen ohne Datums-Filter. Luca & Kristinas Juli-2026-Buchung wird als „Aufenthalt" gezählt, obwohl sie noch gar nicht da waren. Die Berechnung `months_since_last_stay` wird dadurch negativ und der Score-Algorithmus liefert unsinnige Werte – die beiden landen in der Wiederbuchungs-Liste, obwohl sie gerade erst gebucht haben.

**2. E-Mail-Versand scheitert (535 BadCredentials)**
Die Edge-Function-Logs zeigen eindeutig:
```
Invalid login: 535-5.7.8 Username and Password not accepted
```
Das Gmail-App-Passwort (`GMAIL_APP_PASSWORD`) wird von Google abgelehnt. Das ist **kein Code-Problem** – das Passwort ist abgelaufen, wurde widerrufen oder die Zwei-Faktor-Authentifizierung des Gmail-Kontos wurde geändert.

---

## Lösungskonzept

### Teil A – Filter auf vergangene Aufenthalte (Code-Fix)

Datei: `src/hooks/useRebookingScore.ts`

- In der Supabase-Query nur Buchungen laden, deren **`check_out` in der Vergangenheit** liegt:
  ```
  .lt('check_out', new Date().toISOString().split('T')[0])
  ```
- Zusätzlich Status einschränken auf tatsächlich erfolgte Aufenthalte: `status in ('completed','checked_out','checked_in','confirmed')` – stornierte/no-show ausschließen.
- Sicherheits-Guard in der Aggregation: Buchungen mit `check_in >= heute` überspringen, damit auch bei Datenfehlern keine zukünftigen Buchungen einfliessen.
- `months_since_last_stay` auf `Math.max(0, …)` clampen, damit negative Werte (zukünftige Daten) keinen falschen Score erzeugen können.
- Gäste, die nach dem Filtern **0 Aufenthalte** haben, werden automatisch durch den existierenden `guestMap`-Aufbau entfernt.

**Ergebnis:** Luca & Kristina erscheinen erst dann in der Wiederbuchungs-Liste, wenn ihr Aufenthalt im Juli 2026 abgeschlossen ist.

### Teil B – Gmail-Versand reparieren (Konfiguration, kein Code)

Das `GMAIL_APP_PASSWORD`-Secret muss neu gesetzt werden. Schritte für dich:

1. Bei `steinbockchalets@gmail.com` einloggen → https://myaccount.google.com/apppasswords
2. Sicherstellen, dass **2-Faktor-Authentifizierung aktiv** ist (sonst keine App-Passwörter möglich).
3. Neues App-Passwort erstellen (App: „Mail", Gerät: „Lovable Edge Function").
4. Das 16-stellige Passwort (ohne Leerzeichen) als neuen Wert für das Secret `GMAIL_APP_PASSWORD` speichern.

Nach dem Update funktioniert der Versand sofort – kein Re-Deploy nötig.

**Optional (zusätzlicher Code-Fix):** Aktuell verschluckt das Frontend die echte Fehlermeldung („Fehler beim Versand"). Wir können den Toast erweitern, sodass die Server-Fehlermeldung (z. B. „Gmail-Passwort ungültig") direkt angezeigt wird – das hilft bei künftigen Diagnosen.

---

## Umfang der Änderungen

- **`src/hooks/useRebookingScore.ts`** – Query-Filter + Score-Clamp (Teil A)
- **`src/components/Guests/RebookingCampaign.tsx`** – Toast zeigt echten Fehler (Teil B optional)
- **Secret `GMAIL_APP_PASSWORD`** – muss von dir manuell aktualisiert werden

Bestehende Funktionalität, andere Tabs und der Score-Algorithmus selbst bleiben unverändert.
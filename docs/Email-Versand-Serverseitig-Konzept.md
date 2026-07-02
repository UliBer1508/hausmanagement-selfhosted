# Konzept: Serverseitiger E-Mail-Versand (Resend / Gmail-SMTP)

> Status: **Vorschlag / nicht umgesetzt** · Stand: Juni 2026
> Repo: `hausmanagement-selfhosted` (Supabase `usblrulkcgucxtkhugck`)
>
> ⚠️ **Hinweis (aktualisiert):** Das früher genannte `my-sweet-home-manager` (Lovable) wird **nicht mehr verwendet** und ist stillgelegt/gelöscht. Es wird nur noch im `-selfhosted`-Repo gearbeitet.
> Ergänzt die bestehende Outlook-/Vorschaufenster-Lösung — ersetzt sie nicht
> zwingend, sondern bietet einen zweiten, serverseitigen Versandweg.

---

## 1. Warum überhaupt

Der bisherige Weg (Outlook per `mailto:` + App-Vorschaufenster) hat zwei
prinzipielle Grenzen, die nicht im Code, sondern in der Technik liegen:

1. **Absender nicht erzwingbar.** `mailto:` kennt kein Absenderfeld; Outlook
   nimmt immer das Standardkonto (Hotmail). Beim manuellen Wechsel auf
   `steinbockchalets@gmail.com` gehen Betreff und Text verloren.
2. **Sammelmail nicht personalisierbar.** Eine BCC-Mail an mehrere Gäste kann
   pro Empfänger keinen eigenen Namen einsetzen — alle bekommen
   `Liebe/r {guestName}` als unausgefüllten Platzhalter.

Serverseitiger Versand löst beides: Der Absender ist fest
`steinbockchalets@gmail.com`, und jede Mail kann pro Gast personalisiert
werden.

---

## 2. Zwei Versand-Backends — gleiche App-Seite

Die **App-Seite ist identisch**; nur die Edge Function ruft am Ende einen
anderen Versender auf. Die Wahl ist also reversibel und beeinflusst die UI
nicht.

| Backend | Kosten | Absender | Aufwand | Bemerkung |
|---|---|---|---|---|
| **Gmail-SMTP** (`denomailer`) | kostenlos | `steinbockchalets@gmail.com` | App-Passwort von Google | ~500 Mails/Tag, reicht weit |
| **Resend** | Gratis-Tarif (~3.000/Monat) | Domain `steinbockchalets.com` empfohlen | Resend-Konto + ggf. Domain-Verify | professioneller, aber Drittanbieter |

**Empfehlung für den Start:** Gmail-SMTP — kein Drittanbieter, kein Geld,
nutzt das vorhandene Konto. Wechsel auf Resend später jederzeit möglich, ohne
die App-Seite anzufassen.

---

## 3. Die drei Anforderungen — wie sie gelöst werden

### 3.1 E-Mails bearbeiten

Das Bearbeiten passiert **in der App**, vor dem Versand. Das vorhandene
Vorschaufenster (`MailPreviewProvider`) wird erweitert:
- Betreff-Feld **editierbar** (statt nur lesbar)
- Text-Feld **editierbar** (statt nur lesbar)
- Button **„Senden"** zusätzlich zu den Kopier-Buttons

Erst beim Klick auf „Senden" wird der **final bearbeitete** Inhalt an die Edge
Function übergeben. Der Versender bekommt nie eine Rohvorlage.

### 3.2 Vorlagen einfügen

Unverändert übernommen aus dem Ist-Zustand:
- Vorlagen-Auswahl in `GuestCommunication.tsx` (Segment-Sammelmail) und
  `GuestEmailDialog.tsx` (Einzelmail)
- Platzhalter-Ersetzung. **Achtung — heute uneinheitlich:**
  - `GuestEmailDialog.tsx` nutzt `{guestName}` (Zeile ~166
    `replaceTemplatePlaceholders`)
  - `RebookingCampaign.tsx` nutzt `{GUEST_NAME}` / `{CHECK_IN}` (Zeile ~227)
  → **Vereinheitlichen** auf einen Satz Platzhalter (`{guestName}`,
    `{checkIn}`, …) in einer gemeinsamen Helper-Funktion.

Ablauf: Vorlage wählen → Platzhalter ersetzen → Text erscheint im
editierbaren Feld → anpassen → senden.

### 3.3 Mehrere Adressaten (Sammelmail, personalisiert)

**Kern der Verbesserung.** Heute (`GuestCommunication.handleSendBulkMessage`,
Zeile ~107): `to: targetGuests` als Liste mit **einem** `content`, in dem
`{guestName}` NICHT ersetzt wird → alle bekommen denselben Platzhalter.

Neu: Die Edge Function bekommt die **Empfängerliste + die Vorlage mit
Platzhaltern** und sendet in einer **Schleife pro Gast** eine eigene Mail,
mit dem echten Namen eingesetzt. Jeder Gast erhält eine echte Einzelmail,
niemand sieht die anderen Empfänger.

Gewählter Modus (Entscheidung Uli): **Eine Vorlage für alle, Namen
automatisch personalisiert, dann senden** — keine Einzelfreigabe pro Gast.

---

## 4. Datenfluss

```
GuestCommunication / GuestEmailDialog
  → Vorlage wählen, Platzhalter ersetzen
  → Vorschaufenster: Betreff + Text bearbeiten
  → "Senden"
        │  { recipients: [{email, guestName, …}], subjectTemplate, bodyTemplate }
        ▼
  Edge Function  send-guest-email  (service_role)
     • Absender fest: steinbockchalets@gmail.com
     • pro Empfänger: Platzhalter ersetzen → Mail senden (denomailer / Resend)
     • Ergebnis je Empfänger sammeln (erfolg/fehler)
        │  { sent: n, failed: [...] }
        ▼
  App: Toast "n von m gesendet", Verlauf pro Gast via logCommunication
```

---

## 5. Andockpunkte — dateigenau

| Stelle | Änderung |
|---|---|
| **neu:** `supabase/functions/send-guest-email/index.ts` | Versand-Function; spiegelt CORS/serve/Secrets-Muster aus `create-payment-link` und `generate-personalized-email` |
| `src/components/Mail/MailPreviewProvider.tsx` | Betreff/Text editierbar + „Senden"-Button, ruft Function auf |
| `src/components/Guests/GuestCommunication.tsx` | Sammelmail: statt `openEmail({to: liste})` → Function mit Empfängerliste + Vorlage (Personalisierung serverseitig) |
| `src/components/Guests/GuestEmailDialog.tsx` | Einzelmail: optional auch über Function (oder weiter Outlook — Wahl pro Stelle) |
| **neu:** gemeinsame Platzhalter-Helper | `{guestName}`/`{GUEST_NAME}` vereinheitlichen |
| Secrets (Supabase Edge Functions) | Gmail-SMTP: `GMAIL_USER`, `GMAIL_APP_PASSWORD` · ODER Resend: `RESEND_API_KEY` |

> **Hinweis:** Outlook + Vorschaufenster kann als Alternative für Einzelmails
> erhalten bleiben, wo individuelles Bearbeiten im Client gewünscht ist. Der
> serverseitige Weg ist v. a. für die **Sammelmail** der klare Gewinn.

---

## 6. Offene Entscheidungen

1. **Backend:** Gmail-SMTP (kostenlos, empfohlen) oder Resend?
2. **Einzelmail:** auch serverseitig senden oder bei Outlook + Vorschau lassen?
3. **App-Passwort** (bei Gmail-SMTP): einmalig in Google-Konto erzeugen — Uli.
4. **Verlauf:** `logCommunication` pro Empfänger wie bisher beibehalten.

---

## 7. Einrichtung App-Passwort (nur bei Gmail-SMTP)

1. Google-Konto `steinbockchalets@gmail.com` → Sicherheit → Bestätigung in
   zwei Schritten aktivieren (Voraussetzung).
2. App-Passwörter → neues Passwort „Hausverwaltung" erzeugen (16 Zeichen).
3. In Supabase → Edge Functions → Secrets: `GMAIL_USER` und
   `GMAIL_APP_PASSWORD` hinterlegen. Nie im Frontend, nie im Code.

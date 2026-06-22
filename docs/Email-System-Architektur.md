# E-Mail-System — Architektur, Ist-Stand & offene Punkte

> Stand: Juni 2026 · Repo: `my-sweet-home-manager` (Supabase `usblrulkcgucxtkhugck`)
> Diese Datei ist die **maßgebliche Beschreibung** des E-Mail-Versands.
> Sie ersetzt die früheren Outlook-/Gmail-Web-Annahmen in älteren Konzepten.

---

## 1. Grundprinzip (final)

Alle Gäste-/Mieter-E-Mails werden **serverseitig über Gmail-SMTP** versendet —
direkt aus dem Konto `steinbockchalets@gmail.com`. Der Absender ist damit
**garantiert** und kann nicht durch einen lokalen Mail-Client (Outlook)
überschrieben werden.

Vor dem Versand erscheint ein **Vorschaufenster** in der App, in dem Betreff
und Text **bearbeitet** werden. Erst per Klick auf **„Per Gmail senden"** geht
die Mail raus. Kein Outlook, kein Gmail-Web-Login, kein `mailto:`.

### Warum dieser Weg (Historie in Kürze)
- `mailto:`/Outlook scheiterte: Absender nicht erzwingbar (immer Hotmail-Standard),
  Text-Verlust beim manuellen Kontowechsel.
- Gmail-Web-Compose-Link scheiterte: ohne Google-Login im Arbeitsbrowser öffnete
  der Browser einen Datei-Download statt eines Compose-Fensters; URL-Längenlimit
  bei langen/personalisierten Texten.
- Lösung: serverseitiger SMTP-Versand. Kostenlos, kein Drittanbieter,
  Absender fest.

---

## 2. Datenfluss (Ist-Stand)

```
Komponente (z. B. GuestCommunication, GuestEmailDialog)
  → openEmail({ to, subject, html/text, recipients:[{email, guestName,…}] })
        │  (mailtoHelper.ts)
        ▼
  MailPreviewProvider  (Vorschaufenster)
     • Betreff + Text editierbar
     • Button „Per Gmail senden"
        │  supabase.functions.invoke('send-guest-email',
        │     { recipients, subjectTemplate, bodyTemplate })
        ▼
  Edge Function  send-guest-email   (Gmail-SMTP, denomailer)
     • Absender fest: GMAIL_USER (= steinbockchalets@gmail.com)
     • Schleife pro Empfänger: Platzhalter ersetzen → senden
     • { sent: n, failed: [{email,error}] }
        ▼
  Toast „n E-Mail(s) gesendet"
```

---

## 3. Bausteine (umgesetzt ✅)

| Baustein | Datei | Funktion |
|---|---|---|
| **Edge Function** | `supabase/functions/send-guest-email/index.ts` | SMTP-Versand via denomailer, `smtp.gmail.com:465` (TLS). Absender fest aus `GMAIL_USER`. Personalisierung pro Empfänger. Fehler pro Empfänger gesammelt. |
| **Platzhalter-Helper** | `src/lib/emailPlaceholders.ts` | `replacePlaceholders()` — kanonisch, case-insensitive (`{guestName}`/`{guest_name}`, `{checkIn}`, `{checkOut}`, `{houseName}`). |
| **Vorschaufenster** | `src/components/Mail/MailPreviewProvider.tsx` | Betreff/Text editierbar; „Per Gmail senden" ruft Edge Function; Empfängerliste mit Namen. Kopier-/Outlook-Buttons entfernt. |
| **Helper-Brücke** | `src/lib/mailtoHelper.ts` | `openEmail()` löst Vorschaufenster aus (kein automatisches Outlook mehr). `MailtoOptions.recipients` reicht Namen durch. |
| **Secrets** | Supabase Edge Functions | `GMAIL_USER` = steinbockchalets@gmail.com · `GMAIL_APP_PASSWORD` = 16-stelliges Google App-Passwort. |

### Über Vorschaufenster + SMTP laufen bereits (✅)
`GuestCommunication.tsx` (Sammelmail, **personalisiert pro Gast**),
`GuestEmailDialog.tsx` (Einzelmail), `BookingChargesPanel.tsx` &
`CreateBookingForm.tsx` (Zahlungslinks), `GuestContactAlertBanner.tsx`
(Anreise), `TenantPayments.tsx` (Mietzahlung), `LinenOrdersTab.tsx` &
`BookingLinenOverview.tsx` (Wäsche), `useRebookingScore.ts`.

---

## 4. Offene Punkte (To-do)

### A) KI-Mail & Rebooking an SMTP anbinden  — *offen*
`GuestPersonalization.tsx` und `RebookingCampaign.tsx` nutzen
`generate-personalized-email` (Gemini) zur Texterzeugung, senden aber noch
nicht sauber über den neuen Kern mit personalisierten `recipients`.
→ Beide so umstellen, dass sie `recipients` mit `guestName` an `openEmail`
übergeben (analog `GuestCommunication`).

### B) Platzhalter vereinheitlichen  — *offen*
`GuestEmailDialog.tsx` (Z. ~168) hat eine **eigene** Ersetzung mit `{guestName}`
UND `{GUEST_NAME}`; `RebookingCampaign.tsx` nutzt `{GUEST_NAME}`.
→ Diese Eigenlösungen durch den zentralen `emailPlaceholders.ts`-Helper
ersetzen. Eine Wahrheit für Platzhalter.

### C) Outlook-Ballast entfernen  — *offen, niedrige Priorität*
Da alles über SMTP läuft, ist Outlook-Code toter Ballast:
- `mailtoHelper.ts`: `preferLocalClient`, `preferGmailWeb`,
  `buildMailtoHref`, `buildGmailComposeHref`, Gmail-Web-Zweig.
- Schnelllinks `HouseCard.tsx`, `AppReviewsSection.tsx`, `TenantCard.tsx`,
  `TenantContracts.tsx`: nutzen noch `buildMailtoHref`/`buildGmailComposeHref`.
- `SettingsTab.tsx`: Outlook/Gmail-Toggle ist funktionslos geworden.
→ Schrittweise entfernen, wenn der SMTP-Weg im Alltag bestätigt ist.

### D) Zustellbarkeit beobachten  — *laufend*
Gmail-SMTP ~500 Mails/Tag (für Mengen hier unkritisch). Bei Spam-Problemen
später Wechsel auf Resend möglich, ohne die App-Seite anzufassen (nur die
Edge Function tauscht den Versender).

---

## 5. Wichtige Hinweise für die Weiterarbeit

- **Vorschaufenster zeigt Platzhalter:** Im Fenster steht der Text noch mit
  `{guestName}` — die Ersetzung passiert **serverseitig pro Empfänger**. Das ist
  korrekt, kein Bug.
- **Echter Versand:** „Per Gmail senden" verschickt sofort (kein Entwurf mehr).
  Vor Tests an echten Gästen immer zuerst an die eigene Adresse senden.
- **Absender ändern:** Nur über das Secret `GMAIL_USER` — nie aus dem Request
  (Manipulationsschutz in der Edge Function).
- **Verlauf:** `logCommunication` pro Empfänger bleibt unverändert erhalten.

# Notiz-Schnellbearbeitung & kompakte Kartenansicht

Letzte Aktualisierung: 14.06.2026

## Zweck
Einheitliches Notiz-Icon und kompakte, mehrspaltige Darstellung auf den drei
wichtigsten Übersichtskarten:

- Reinigungskarte (Endreinigung)
- Wäschekarte (Lieferschein)
- Buchungskarte (Reservierung) — sowohl in der „Verknüpften Ansicht" als auch
  im Buchungs-Tab

## UI-Konzept

### Notiz-Icon im Kopfbalken
- Position: rechts neben dem Titel, direkt vor dem Status-Badge
- Icon: `StickyNote` (lucide-react), eingebettet in `bg-white/15`-Button (7×7)
- **Indikator-Dot**: Gelber Punkt (`bg-amber-300`) oben rechts, sobald eine
  Notiz im jeweiligen Datensatz vorhanden ist
- Klick öffnet `NotesQuickDialog` zum Anzeigen/Bearbeiten/Speichern

### Kompakte Datenraster
Statt einer vertikalen Liste werden Felder in einem responsiven Grid
(`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) nebeneinander dargestellt, um
Platz zu sparen, ohne Informationen zu verlieren.

## Komponenten

| Datei | Funktion |
|---|---|
| `src/components/shared/NotesQuickDialog.tsx` | Wiederverwendbarer Dialog (Textarea + Speichern/Abbrechen) |
| `src/components/Cleaning/CleaningManagement.tsx` | Reinigungskarte: Notiz-Icon + Kompakt-Grid, Update auf `service_tasks.notes` |
| `src/components/Bookings/ServiceTaskCard.tsx` | Reinigungs-Card-Variante in der Verknüpften Ansicht |
| `src/components/Bookings/LaundryOrderCard.tsx` | Wäschekarte: Notiz-Icon + Kompakt-Grid, Update auf `linen_orders.notes` |
| `src/components/Bookings/BookingCard.tsx` | Buchungskarte (Verknüpfte Ansicht): Notiz-Icon, Update auf `bookings.notes` |
| `src/components/Bookings/BookingOverviewFixed.tsx` | Buchungskarte im Buchungs-Tab: gleiches Icon + Dialog |

## Persistenz
- `service_tasks.notes` — bereits vorhanden
- `linen_orders.notes` — bereits vorhanden
- `bookings.notes` — bereits vorhanden

Keine Migration nötig. Nach jedem Speichern wird die zugehörige
React-Query-Cache invalidiert (`cleaning-tasks`, `linen-orders`, `bookings`,
`bookings-overview`).

---

# Gäste-Kommunikationshistorie (Stufe 1)

## Zweck
Jede aus der App gesendete Gast-E-Mail wird gespeichert und pro Gast als
Verlauf angezeigt. Eingehende Antworten können manuell („Antwort notieren") als
Copy-Paste aus Gmail nachgetragen werden — Zwei-Wege-Historie ohne Gmail-API.

## Datenbank
Tabelle `guest_communications` mit:
- `guest_id`, `guest_email`, `guest_name`
- `direction` (`outbound` / `inbound`)
- `subject`, `body`, `occurred_at`
- RLS: Admin-Only (`has_role(auth.uid(), 'admin')`)

## Komponenten / Hooks
| Datei | Funktion |
|---|---|
| `src/hooks/useGuestCommunications.ts` | `useGuestCommunications`-Query + `logCommunication`-Helper |
| `src/components/Guests/GuestCommunicationHistory.tsx` | Verlauf-Anzeige pro Gast + Dialog „Antwort notieren" |
| `src/components/Guests/GuestCommunication.tsx` | Logging bei Segment-/Personalisierten Mailings |
| `src/components/Guests/GuestEmailDialog.tsx` | Logging beim Versand aus Gast-Dialog |
| `src/hooks/useRebookingScore.ts` | Logging bei Rebooking-Mails |
| `src/components/Guests/GuestDetailsDialog.tsx` | Bindet Verlauf am unteren Rand des Gast-Details ein |

## Hinweis Stufe 2 (später)
Automatisches Einlesen eingehender Gmail-Antworten erfordert Gmail-API
(OAuth + Edge Function). Nicht Teil von Stufe 1.

---

# E-Mail-Versand via Gmail-Web (Standard)

- `src/lib/mailtoHelper.ts` öffnet E-Mails standardmäßig in Gmail-Web mit
  festem Absender `steinbockchalets@gmail.com`. Betreff & Text bleiben erhalten.
- Outlook/lokaler Mail-Client bleibt als Option erhalten und ist über die
  Einstellungen (`SettingsTab.tsx`) umschaltbar.
- Komponenten wie `GuestContactAlertBanner.tsx` und `GuestEmailDialog.tsx`
  nutzen `buildGmailComposeHref` und profitieren automatisch.

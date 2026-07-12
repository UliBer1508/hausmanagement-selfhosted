# CODE-INDEX — Vollständige Landkarte des Projekts

> **Zweck:** „Wo ist X?" in Sekunden beantworten, statt durch 200+ Dateien zu
> raten. **Pflichtlektüre für Lovable und Claude VOR jeder Code-Änderung.**
> Deckt das **gesamte** Projekt ab (nicht nur einzelne Module).
> Widerspricht der Index dem Code: **Code gewinnt**, Index danach korrigieren
> (Abschnitt 14 „Pflege").
>
> Letzte Aktualisierung: 15.06.2026 · Stand-Commit: `83b07ce`

---

## 0. So findest du eine Stelle (immer in dieser Reihenfolge)

1. **Tab bestimmen** → Abschnitt 2 (Haupt-Tabs) und Abschnitt 4–13 (Sub-Tabs je Modul).
2. **Kette folgen:** Vom Tab-Einstieg den `import`-Pfaden nach unten bis zur Zieldatei.
3. **Doppelgänger prüfen** → Abschnitt 3 „Verwechslungsgefahr". **Immer** gegenprüfen.
4. **Grep als Kontrolle:** eindeutigen UI-Text/Feldnamen suchen, z. B.
   `grep -rn "Lieferschein" src/`. UI-Text steht fast immer direkt an der Stelle.
5. **Daten-Bug?** Wenn ein Feld leer ist, das die Karte rendern soll: **zuerst
   prüfen, ob die Query/der Prop das Feld überhaupt lädt** — nicht die Karte.

> Faustregel: Diese App hat **kein Seiten-Routing**. Alles hängt an Tabs in
> `OriginalDashboard.tsx`. Frage nie „welche Route?", sondern „welcher Tab?".

---

## 1. Architektur in einem Bild

```
src/main.tsx
 └─ src/App.tsx                    QueryClient, Router, Toaster, globales ErrorBoundary
      ├─ /login → pages/Login.tsx
      ├─ /      → pages/Index.tsx
      │            └─ Layout/AppLayout.tsx
      │                 └─ pages/OriginalDashboard.tsx   ← ZENTRALE TAB-NAVIGATION
      │                      ├─ Tab-Liste (≈ Z. 891–901)
      │                      └─ switch(activeTab) (≈ Z. 1168 ff.) → Modul-Komponente
      └─ Chat/ChatAssistant.tsx    Floating AI-Assistent (immer sichtbar)
```

**Schlüsseldateien:**
| Rolle | Datei |
|---|---|
| App-Einstieg | `src/App.tsx` |
| Layout-Hülle | `src/components/Layout/AppLayout.tsx` |
| **Navigations-Drehscheibe** | `src/pages/OriginalDashboard.tsx` |
| Login | `src/pages/Login.tsx` |
| 404 | `src/pages/NotFound.tsx` |
| AI-Assistent (Max) | `src/components/Chat/ChatAssistant.tsx` |
| **Max — Gehirn (Backend)** | `supabase/functions/chat-assistant/index.ts` (≈3.550 Z.) |
| Max — Aktionen-Fenster | `src/components/Chat/MaxActionsPanel.tsx` |
| Max — Abläufe-Fenster | `src/components/Chat/MaxAblaeufePanel.tsx` |
| PWA-Statusleiste | `src/components/PWA/AppStatusBar.tsx` |

---

## 2. Haupt-Tabs → Einstiegs-Komponente

(`OriginalDashboard.tsx`, `switch(activeTab)`)

| Tab (UI) | Emoji | Einstieg | Datei |
|---|---|---|---|
| Übersicht | 📊 | `OverviewTab` | `components/Dashboard/OverviewTab.tsx` |
| Kalender | 📅 | `CalendarTab` | `components/Dashboard/CalendarTab.tsx` |
| Buchungen | 📅 | `BookingOverviewFixed` | `components/Bookings/BookingOverviewFixed.tsx` |
| Gäste | 👥 | `GuestManagement` | `components/Guests/GuestManagement.tsx` |
| Mieter | 🏘️ | `TenantManagement` | `components/Tenants/TenantManagement.tsx` |
| Häuser | 🏠 | `HouseManagement` | `components/Houses/HouseManagement.tsx` |
| Reinigung | ✨ | `CleaningManagement` | `components/Cleaning/CleaningManagement.tsx` |
| Provider | 🏢 | `ProviderTab` | `components/Dashboard/ProviderTab.tsx` |
| Wäsche | 💧 | `LinenDashboard` | `components/Houses/LinenDashboard.tsx` |
| Preise | 💶 | `PricingTab` → `PricingDashboard` | `components/Dashboard/PricingTab.tsx` |
| Einstellungen | ⚙️ | `SettingsTab` | `components/Dashboard/SettingsTab.tsx` |

> Mehrere Tab-Inhalte bekommen vorgeladene Daten als Props aus
> `OriginalDashboard` (z. B. Kalender: `bookingsData`, `serviceTasks`,
> `linenOrders`). Bei „leeren" Feldern dort die Quelle prüfen.

---

## 3. Verwechslungsgefahr — die „Doppelgänger" (zuerst lesen!)

> **Verbindliche Kartennamen:** Für die drei Karten-Typen (Buchung, Reinigung,
> Wäsche) und ihre zwei Erscheinungsorte (Dashboard-Übersicht vs. Detail-Tab)
> gilt `docs/Karten-Namenskonvention.md`. Zielbild: **eine Datei pro Typ**,
> gesteuert über `variant="overview" | "full"`. Umstellung erfolgt schrittweise,
> beginnend mit der **Wäschekarte** (`LaundryOrderCard.tsx`). Solange ein Typ
> noch nicht umgestellt ist, gelten die unten genannten Doppelgänger weiter.

### „Reinigungskarte" existiert DREIMAL
| Sichtbar in | Datei | Layout | Wann diese? |
|---|---|---|---|
| Tab „Reinigung" | `Cleaning/CleaningManagement.tsx` (inline, ≈ Z. 522) | breit, viele Felder | Reinigungskarte in der Reinigungs-Verwaltung |
| Verknüpfte Ansicht (mittlere Spalte) | `Bookings/ServiceTaskCard.tsx` | schmal | neben Buchung |
| Tab „Übersicht" | `Operations/CleaningsCard.tsx` | Mini-Liste | Dashboard-Kachel „Reinigungen" |

### „Wäschekarte / Linen"
| Sichtbar in | Datei | Rolle |
|---|---|---|
| Wäschebestellung + verknüpfte Ansicht | `Bookings/LaundryOrderCard.tsx` | **DIE** Karte (Lieferschein). Übersicht **und** Wäsche-Tab über `variant`-Prop (`overview`/`full`) — kein Doppelgänger mehr. |
| (Wrapper) | `Bookings/LaundryOrderCardWithStatus.tsx` | zieht externen Portalstatus, reicht durch |
| Tab „Übersicht" | `Operations/LinenDeliveriesCard.tsx` | Dashboard-Kachel |
| Tab „Wäsche" (Container) | `Houses/LinenDashboard.tsx` | Seite mit Liste/Kennzahlen/Dialog |
| „Smart/Analytics" | `Houses/SmartLinenDashboard*.tsx`, `Houses/LinenOrderAnalytics.tsx` | Auswertungen, **nicht** die Karte |

### „Buchungskarte"
| Sichtbar in | Datei |
|---|---|
| Verknüpfte Ansicht + Übersicht | `Bookings/BookingCard.tsx` |
| Tab „Buchungen" (Liste/Detail) | `Bookings/BookingOverviewFixed.tsx` |

### Technische Fallen (12.07.2026 teuer erkauft — VOR dem Ändern lesen!)

**1. Unvollständige Feldlisten bei Supabase-Joins.**
Supabase liefert bei verschachtelten Abfragen **nur die ausdrücklich genannten
Felder** — ohne Fehlermeldung. Beispiel: `LinenDashboard.tsx` lud
`bookings!…(guest_name, check_in)`; im Wäsche-Dialog stand deshalb „Gäste: N/A",
obwohl die Buchung `number_of_guests = 6` hatte.
→ **Regel:** Wer einen Dialog um ein Feld erweitert, MUSS die Ladeabfrage des
Aufrufers mitziehen. Prüfen: alle `<objekt>.<feld>`-Zugriffe im Dialog gegen die
`select(...)`-Liste abgleichen.
→ **Besseres Muster:** Der Dialog lädt SELBST anhand der ID (so macht es
`EditCleaningTaskDialog.tsx`) — dann kann kein Aufrufer eine beschnittene
Version hereinreichen.

**2. Check-Constraints in der DB.**
`create-linen-order-for-booking` setzte `order_source: 'manual_max'` — der
Constraint `linen_orders_order_source_check` erlaubte diesen Wert nicht. Jeder
Insert scheiterte; **die Funktion konnte seit ihrem Umbau (11.07.) nie arbeiten.**
→ **Prüfen:** `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '…';`
→ Erlaubt sind jetzt: `booking_required`, `manual`, `buffer_refill`,
`auto_booking_lookahead`, `manual_max`.

**3. z-Index bei Select-im-Dialog.**
`DialogContent` in `MailPreviewProvider.tsx` hat `z-[300]`; ein Select-Popover
(Standard `z-50`) liegt dann DAHINTER und ist unsichtbar (man sieht nur den blauen
Rand). → Lösung: `<SelectContent position="popper" className="z-[400]">`.
→ **NICHT** `modal={false}` am Dialog setzen — dann wertet er den Klick aufs
Popover als „Klick nach draußen" und schließt sich.

**4. Max verschluckt Fehlermeldungen.**
Bei „Funktion schlägt fehl" meldet Max nur „konnte nicht angelegt werden".
→ Die Edge Function **direkt** aufrufen (Dashboard → Edge Functions → Send
Request) — dort steht der echte Fehler im Klartext.

### Weitere Stolperfallen
- **Dashboard ≠ Dashboard:** `OverviewTab` (Tab-Inhalt) vs.
  `RealDataDashboard`/`Operations/OperationsDashboard` (Teilbausteine darin).
- **Drei Linen-„Dashboards":** `LinenDashboard` (Tab-Seite),
  `SmartLinenDashboard` / `SmartLinenDashboardWithTabs` (KI-Auswertung).
- **„Tab"-Dateien sind Unterseiten, nicht der Haupt-Tab:** z. B.
  `Houses/LinenOrdersTab.tsx`, `Houses/AdditionalFeesTab.tsx`,
  `Houses/PricingConfigTab.tsx` sind Sub-Tabs **innerhalb** Häuser/Wäsche.

---

## 4. Modul „Übersicht" (Tab 📊)

`Dashboard/OverviewTab.tsx` bündelt:
- **Alert-Banner:** `BookingInquiryAlertBanner`, `GuestContactAlertBanner`,
  `RatingReminderBanner`, `CleaningStatusAlertBanner`, `LinenApprovalAlertBanner`
- **Karten:** `BookingCard`, `ServiceTaskCard`, `LaundryOrderCardWithStatus`
- **Kennzahlen/Listen:** `StatsCards`, `RecentBookings`, `TaskOverview`,
  `RealDataDashboard`
- **Operations-Kacheln:** `Operations/CheckInsCard`, `CheckOutsCard`,
  `CleaningsCard`, `LinenDeliveriesCard`, `RevenueCard`, `OperationsDashboard`,
  `TimeRangeTabs`

---

## 5. Modul „Buchungen" (Tab 📅)

```
BookingOverviewFixed.tsx                 Liste + Detail im Buchungs-Tab
 ├─ CreateBookingDialog.tsx → CreateBookingForm.tsx   Anlegen
 ├─ EditBookingDialog.tsx                              Bearbeiten
 ├─ BookingCard.tsx                                    Einzelkarte
 ├─ BookingChargesPanel.tsx                            Zusatzforderungen (Surcharges)
 ├─ BookingStats.tsx                                   Kennzahlen
 └─ ConnectedBookingView.tsx                           3-Spalten: Buchung|Reinigung|Wäsche
       ├─ ConnectionLine.tsx  (Verbindungslinien)
       ├─ ServiceTaskCard.tsx
       └─ LaundryOrderCardWithStatus.tsx
 GuestSuggestions.tsx                                  Gast-Autovervollständigung im Formular
```
> ⚠️ `ConnectedBookingView` hat **eigene** Supabase-Queries (unabhängig von
> `LinenOrdersList`). Felder hier separat prüfen/laden.

---

## 6. Modul „Gäste" (Tab 👥)

`Guests/GuestManagement.tsx` mit Sub-Tabs:
| Sub-Tab (value) | Komponente |
|---|---|
| overview | `GuestOverview.tsx` (+ `GuestList`, `GuestStats`) |
| analytics | `GuestAnalytics.tsx` |
| communication | `GuestCommunication.tsx` (+ `GuestCommunicationHistory`) |
| segments | `GuestSegments.tsx` |
| marketing | `MarketingActions.tsx` (+ `RebookingCampaign`) |

Weitere Gäste-Dialoge/Bausteine: `GuestDetailsDialog`, `GuestEditDialog`,
`GuestEmailDialog`, `GuestMergeDialog`, `GuestDuplicatesDialog`,
`GuestPersonalization`, `GuestAppTracking`, `GuestSessionDetail`,
`AppReviewsSection`, `EmailTemplateEditor`, `DynamicPricingPanel`,
`MLSettingsDialog`, `CreateActionDialog`, `ActionDetailsDialog`.

---

## 7. Modul „Mieter" (Tab 🏘️) — Dauermiete

`Tenants/TenantManagement.tsx` mit Sub-Tabs:
| Sub-Tab | Komponente |
|---|---|
| overview | `TenantOverview.tsx` (+ `TenantCard`, `TenantStats`) |
| contracts | `TenantContracts.tsx` (+ `RentHistoryDialog`) |
| payments | `TenantPayments.tsx` (+ `CreatePaymentDialog`, `EditPaymentDialog`, `MonthlyPaymentTimeline`) |
| utilities | Nebenkosten: `UtilityCostSettings`, `UtilityCostEntry`, `UtilityStatementGenerator`, `ExcelUtilityImport` |
| analytics | `TenantAnalytics.tsx` (+ `OverallPerformance`, `ObjectPerformanceCard`) |

> Nebenkosten-Abrechnungs-PDF: `lib/utilityStatementPdf.ts`.

---

## 8. Modul „Häuser" (Tab 🏠)

`Houses/HouseManagement.tsx` → Liste aus `HouseCard.tsx`;
Anlegen/Bearbeiten: `CreateHouseDialog.tsx`, `EditHouseDialog.tsx`
(enthält die Sub-Tabs für ein Haus, u. a.):
- `PricingConfigTab.tsx`, `AdditionalFeesTab.tsx`
- `LinenSetRulesTab.tsx`, `LinenPricesTab.tsx`, `LinenItemDialog.tsx`
- `HouseInventory.tsx`, `LinenInventoryDialog.tsx`
- `ExternalArticleMappingDialog.tsx`, `TeuniSetTemplatesDialog.tsx`, `TeuniSourcePanel.tsx`
- KI: `AIOptimizationDialog.tsx`, `AdvancedMLSettings.tsx`, `OptimizationFeedback.tsx`
- Konkurrenz: Unterordner `Houses/CompetitorAnalysis/`

---

## 9. Modul „Reinigung" (Tab ✨)

```
Cleaning/CleaningManagement.tsx          rendert die breiten Reinigungskarten INLINE
 ├─ CreateCleaningTaskDialog.tsx
 ├─ EditCleaningTaskDialog.tsx            lädt SELBST per ID (vorbildliches Muster!)
 ├─ AutoCleaningSettingsCard.tsx          Auto-Reinigung-Einstellungen
 ├─ MaxReminderSettingsCard.tsx           Max → Amela: Terminfrage (Cron 07:00)
 └─ MaxLinenReminderSettingsCard.tsx      Max → Teuni: Wäsche (Cron 07:30)
                                          ACHTUNG: liegt in Cleaning/, wird aber im
                                          WÄSCHE-Tab (LinenDashboard.tsx) gerendert!
```
**Trigger auf `service_tasks`:** `trg_notify_amela_on_cleaning_release` (Amela
benachrichtigen) + `trg_close_max_action_on_cleaning_scheduled` (Max-Vorgang
abschließen) — beide feuern bei `draft → scheduled`.
Hook: `useServiceTasks.ts`, `useCleaningAutomationSettings.ts`,
`useCleaningStatusNotifications.ts`.

---

## 10. Modul „Wäsche" (Tab 💧)

```
Houses/LinenDashboard.tsx                 Seite: Kennzahlen + Liste + Anlege-Dialog
 ├─ LinenOrdersList.tsx                   Liste (Query lädt bookings: check_in/out, number_of_guests)
 │    └─ Bookings/LaundryOrderCardWithStatus.tsx → Bookings/LaundryOrderCard.tsx  ← Lieferschein-Karte
 ├─ LinenOrderDialog.tsx                  Bestellung anlegen/bearbeiten
 ├─ LinenOrderEmailDialog.tsx             Bestell-E-Mail
 ├─ AutoLinenOrderSettingsCard.tsx        Automatisierung
 ├─ BookingLinenOverview.tsx              Buchungen mit/ohne Bestellung
 └─ BookingWithoutOrderCard.tsx
KI/Auswertung: SmartLinenDashboard(WithTabs).tsx, SmartLinenOptimizer.tsx,
               SmartLinenSettings.tsx, LinenOrderAnalytics.tsx
```
Hooks: `useOptimizedLinenManagement`, `useBookingLinenOrders`, `useLinenAI`,
`useLinenAutomationSettings`, `useExternalSync`, `useExternalOrderStatus`,
`useExternalArticleMapping`, `useExternalStammdaten`.
Externes Portal: `integrations/externalLaundry/client.ts`.

---

## 11. Modul „Provider" (Tab 🏢) & Service-Portal-Abrechnung

`Dashboard/ProviderTab.tsx` (Übersicht der Dienstleister) + `ServicePortal/`:
- `ServiceHeader.tsx`, `ProviderManagementDialog.tsx`, `ProviderBillingDialog.tsx`
- Aufträge: `LaundryOrdersOverview.tsx`, `TeuniOrdersOverview.tsx`
- Rechnungen: `LaundryInvoicesList.tsx`, `CreateInvoiceDialog.tsx`,
  `EditInvoiceDialog.tsx`, `InvoiceDetailsDialog.tsx`, `MergeInvoicesDialog.tsx`,
  `AssignOrdersToInvoiceDialog.tsx`
Hooks: `useProviderMessages`, `useProviderMessageNotifications`, `useLaundryInvoices`.

---

## 12. Modul „Preise" (Tab 💶)

```
Dashboard/PricingTab.tsx  → Pricing/PricingDashboard.tsx
                              ├─ PricingConfigCard.tsx
                              └─ PricingFactorsConfig.tsx
```
Hooks/Services: `usePricingConfig`, `usePricingSettings`, `useDynamicPricing`,
`usePriceLabs`, `useAirROI`, `services/marketOccupancyService`.

---

## 13. Modul „Einstellungen" (Tab ⚙️)

`Dashboard/SettingsTab.tsx` (Profil-, Benachrichtigungs-, Testeinstellungen) +
`Settings/`: `AirROISyncCard.tsx`, `GuestImportCard.tsx`,
`RatingReminderSettingsCard.tsx`.
Hooks: `useSystemSettings`, `usePricingSettings`, `useAppVersionCheck`.

**Karten im Einstellungen-Tab** (`Dashboard/SettingsTab.tsx`):
- `Settings/MaxMorningSummaryCard.tsx` — **NEU 12.07.:** Max' Morgen-Übersicht
  (Not-Aus-Schalter, Empfänger-E-Mail, Uhrzeit). Hook:
  `useMorningSummarySettings()` in `useSystemSettings.ts`.
- `Settings/RatingReminderSettingsCard.tsx` — Bewertungs-Erinnerungen
- `Settings/GuestImportCard.tsx` — Gästeliste importieren
- `Settings/AirROISyncCard.tsx` — AirROI-Abgleich
---

## 13a. MAX — der KI-Assistent (Stand 12.07.2026)

> Größter Ausbau der letzten Wochen. War bis 12.07. NICHT in diesem Index —
> daher hier vollständig nachgetragen.

### Frontend (`src/components/Chat/`)
```
ChatAssistant.tsx        Floating-Fenster, immer sichtbar. Zwei Reiter: KI / Messaging.
 ├─ ChatMessage.tsx      Rendert Antworten + ENTITY-BUTTONS (Schnellzugriff)
 ├─ ChatInput.tsx
 ├─ ActionCard.tsx
 ├─ MaxActionsPanel.tsx  Fenster „Max: Aktionen" — laufende Workflows, Status-Badges
 └─ MaxAblaeufePanel.tsx Fenster „Max: Abläufe (Kontrolle)" — Soll-Vorgaben (Doku!)
```
Hooks: `useChat.ts`, `useMorningSummary.ts`, `useProviderMessages.ts`.

**Entity-Buttons** (`ChatMessage.tsx`, `handleEntityClick`): Max erzeugt nur vier
Typen — `booking` (→ `editBookingId`), `cleaning_task` (→ `openTaskId`),
`laundry_order` (→ `openOrderId`), `email_draft` (→ MailPreview).
`house`/`guest`/`calendar` sind **toter Code** (Max erzeugt sie nie).

### Backend: `supabase/functions/chat-assistant/index.ts` (≈ 3.550 Zeilen)
Modell: **Gemini 2.5 Flash**. Enthält Tool-Definitionen, Dispatcher,
execute-Funktionen, `buildEntityLinks` (Buttons), dynamischen System-Prompt.

**28 Werkzeuge:**
| Gruppe | Werkzeuge |
|---|---|
| Lesen | `search_bookings`, `search_cleaning_tasks`, `search_linen_orders`, `search_guests`, `search_houses`, `search_booking_inquiries`, `get_booking_full_context`, `get_dashboard_stats`, `get_revenue_stats`, `get_linen_overview`, `get_calendar_events`, `get_daily_overview` |
| Übersicht | `get_morning_summary` (→ Edge Fn `morning-summary`), `get_guest_contact_reminders`, `get_rating_reminders` |
| Wächter | `check_upcoming_bookings` (4 Prüfungen: fehlende Reinigung/Wäsche, Timing, offene Zahlung) |
| Anlegen | `create_cleaning_for_booking` (→ `create-cleaning-task-for-booking`, Status `draft`), `create_linen_for_booking` (→ `create-linen-order-for-booking`), `create_bulk_cleaning_tasks`, `create_bulk_linen_orders` |
| Ändern | `reschedule_cleaning` (Termin → `draft`), `update_linen_for_booking` (→ `generate-booking-linen-order`) |
| Anfragen | `accept_booking_inquiry`, `reject_booking_inquiry` |
| Kommunikation | `send_provider_message`, `read_provider_replies` |
| Sonstiges | `draft_guest_welcome_email`, `save_knowledge` |

**Modell A (nicht verhandelbar):** Max handelt NUR nach ausdrücklicher Freigabe
durch Uli. Er liest Antworten nur auf Nachfrage.

### DB-Tabellen für Max
| Tabelle | Zweck |
|---|---|
| `max_actions` | **Protokoll** aller Max-Vorgänge. Felder: `action_type, status, booking_id, guest_name, details, related_task_id, last_step, waiting_for, due_at`. Status: `wartet_uli`, `wartet_provider`, `ueberfaellig`, `abgeschlossen`. Angezeigt in `MaxActionsPanel.tsx`. |
| `max_ablaeufe` | **Soll-Vorgabe / Checkliste** (44 Zeilen). Spalten: `aktion, variante, schritt_nr, akteur, schritt, ergebnis_status, umsetzung, funktion, notiz`. **STEUERT MAX NICHT** — reine Doku, manuell gepflegt. Angezeigt in `MaxAblaeufePanel.tsx`. |
| `assistant_knowledge` | Was Max sich dauerhaft merken soll (`save_knowledge`). |
| `provider_messages` | Nachrichten Max ↔ Amela/Teuni. **`related_task_id` verknüpft jede Nachricht mit der Reinigung** — Kern der geschlossenen Kette. |
| `system_settings` | Schlüssel `max_control_settings`, `morning_summary_settings`. |

### Automatik (Edge Functions + Cron)
```
06:15  overdue-watch          → overdue-watch-daily        Überfällig-Wächter
06:30  morning-summary        → morning-summary-daily      Tagesübersicht per E-Mail
07:00  max-cleaning-reminders → max-cleaning-reminders-daily  Amela: „Passt der Termin?"
07:30  max-linen-reminders    → max-linen-reminders-daily  Teuni: „Wäsche liefern"
```
- **`overdue-watch`** (NEU 12.07.): sucht `max_actions` mit `wartet_provider` +
  abgelaufenem `due_at` → setzt `ueberfaellig`. Sichtbar in `MaxActionsPanel`
  (rotes Badge) und ganz oben in der Morgen-Übersicht.
- **`morning-summary`** (NEU 10.07.): **einzige Quelle der Wahrheit** für die
  Tagesübersicht. Zwei Modi: Abruf (`deliver=false`) und Zustellung
  (`deliver=true` + `morning_summary_settings.enabled=true` → `send-guest-email`).
  Der Frontend-Hook `useMorningSummary.ts` ruft NUR diese Function (keine
  Doppellogik).
- Einstellungskarte: `Settings/MaxMorningSummaryCard.tsx` (Einstellungen-Tab).

### DB-Trigger (Kern der Ketten)
| Trigger | Auf | Was |
|---|---|---|
| `trg_notify_amela_on_cleaning_release` | `service_tasks` | Bei `draft→scheduled`: benachrichtigt Amela (nur wenn sie via `related_task_id` gefragt hatte) |
| `trg_close_max_action_on_cleaning_scheduled` | `service_tasks` | **NEU 12.07.:** Bei `draft→scheduled`: schließt den offenen `max_actions`-Vorgang ab |

---

## 14. Querschnitt: Hooks, lib, Integrationen, UI

### Hooks (`src/hooks/`, ≈ 49) — Daten & Logik, Schema `useXxx.ts`
Buchungen/Anfragen: `useBookings`, `useBookingInquiries`, `useBookingCharges`,
`useBookingLinenOrders`, `useBookingMarketingActions`.
Reinigung: `useServiceTasks`, `useCleaningAutomationSettings`,
`useCleaningStatusNotifications`.
Wäsche: `useOptimizedLinenManagement`, `useLinenAI`, `useLinenAutomationSettings`,
`useExternalSync`, `useExternalOrderStatus`, `useExternalArticleMapping`,
`useExternalStammdaten`, `useLaundryInvoices`.
Gäste: `useGuests`, `useGuestProfile`, `useGuestCommunications`,
`useGuestContactReminders`, `useGuestDuplicates`, `useGuestStayCounts`,
`useGuestAppTracking`, `useRebookingScore`, `useRatingReminders`.
Häuser/Preise: `useHouses`, `usePricingConfig`, `usePricingSettings`,
`useDynamicPricing`, `usePriceLabs`, `useAirROI`, `useCompetitorAnalysis`,
`useVacancyAI`, `useAdditionalFees`.
Mieter: `useTenantPayments`, `useTenantRentChanges`, `useUtilityCosts`.
Dashboard/System: `useDashboard`, `useOperationsDashboard`, `useMorningSummary`,
`useSystemSettings`, `useAppVersionCheck`, `useChat`,
`useEmailTemplates`, `useMarketingActions`, `useProviderMessages`,
`useProviderMessageNotifications`.
Basis: `use-toast`, `use-mobile`.

### lib (`src/lib/`) — reine Helfer (keine UI, kein State)
`guestHelpers` (getGuestName/Email/Phone mit Fallback), `dateHelpers`,
`holidayCalendar`, `schoolHolidays`, `linenCalculation`, `linenOrderHelpers`,
`linenMigration`, `mailtoHelper`, `nameNormalization`, `ratingHelpers`,
`utilityStatementPdf`, `utils` (`cn()`).

### Integrationen / Backend
- Supabase Client (eigene DB): `integrations/supabase/client.ts`
- Supabase Typen (generiert, **nicht** händisch editieren): `integrations/supabase/types.ts`
- Externes Wäsche-Portal: `integrations/externalLaundry/client.ts`
- Edge Functions / Migrationen / RPCs: Ordner `supabase/` im Repo-Root

**Edge Functions (33, Stand 12.07.2026)** — die wichtigsten:
| Function | Zweck |
|---|---|
| `chat-assistant` | **Max' Gehirn** (Gemini 2.5 Flash, 28 Werkzeuge) |
| `morning-summary` | Tagesübersicht (einzige Quelle der Wahrheit) — NEU 10.07. |
| `overdue-watch` | Überfällig-Wächter — NEU 12.07. |
| `max-cleaning-reminders` | Amela: Terminfrage (Cron 07:00) |
| `max-linen-reminders` | Teuni: Wäsche-Erinnerung (Cron 07:30) |
| `create-cleaning-task-for-booking` | Reinigung anlegen (Status `draft`) |
| `create-linen-order-for-booking` | Wäschebestellung anlegen (Status `offen`) |
| `generate-booking-linen-order` | **Mengen + Preise berechnen** (aus `linen_rules` + `ai_linen_settings`) |
| `auto-create-linen-orders` | Wäsche-Batch-Automatik (Cron 06:00) |
| `send-guest-email` | Gmail-SMTP-Versand (auch für Morgen-E-Mail) |
| `create-payment-link`, `stripe-webhook` | Zahlungen |
| `pricing-engine`, `daily-pricing`, `scrape-competitor-prices` | Preise |
- Tiefen-Doku: `System-Knowledge.md`, `docs/` (z. B.
  `Database-Relational-Assessment.md`, `Waesche-Management-Gesamtsystem.md`,
  `Linen-Order-Status-Standard.md`)

### UI-Bausteine
- shadcn/ui-Primitive: `components/ui/*` (≈ 50) — nur verwenden, nicht umbauen.
- Geteilte App-Bausteine: `components/shared/*` (z. B. `NotesQuickDialog`).
- Kompakt-Karten-/Notiz-Konzept: `docs/Notes-Quick-Edit-And-Compact-Cards.md`.

---

## 15. Pflege dieses Index (Pflicht, Teil jeder Änderung)

- Neue Komponente / Tab / Hook / Kette → passenden Abschnitt **im selben
  Commit** ergänzen.
- Datei umbenannt/verschoben/gelöscht → hier nachziehen.
- Neuer **Doppelgänger** (zweite Karte/Ansicht mit ähnlichem Zweck) → in
  Abschnitt 3 aufnehmen, sonst kehrt genau das alte „falsche Stelle gefunden"-
  Problem zurück.
- Vor dem Verlassen auf eine Index-Angabe bei Zweifel kurz per `grep`/Klick
  verifizieren. **Code ist die Wahrheit, der Index ist die Abkürzung.**

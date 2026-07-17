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

### ⚠️ Chat-Komponenten existieren DOPPELT: `components/` UND `components/Chat/`

**Drei Max-Komponenten liegen zweimal im Repo** — einmal in `src/components/`,
einmal in `src/components/Chat/`. Das ist eine echte Doppelgänger-Falle: Ändert man
nur eine, wirkt die Änderung evtl. nicht (die andere wird gerendert).

| Datei | `components/` | `components/Chat/` | identisch? | **AKTIV ist** |
|---|---|---|---|---|
| `ChatAssistant.tsx` | ja | ja | identisch | **`Chat/`** — `App.tsx` Z.16 lädt `./components/Chat/ChatAssistant` |
| `MaxAblaeufePanel.tsx` | ja | ja | identisch | **`Chat/`** — von `Chat/ChatAssistant` importiert (`./MaxAblaeufePanel`) |
| `MaxWissenPanel.tsx` | ja | ja | **UNTERSCHIEDLICH!** | **`Chat/`** — die `components/`-Version ist veraltet |

**Regel:** Wer eine dieser drei ändert, ändert die Version in **`src/components/Chat/`**
(das ist die aktive) — und prüft, ob die Dublette in `src/components/` mitgezogen
werden muss oder besser gelöscht wird. `MaxWissenPanel` weicht bereits ab; hier ist
Vorsicht Pflicht. Einstiegskette: `App.tsx` → `Chat/ChatAssistant.tsx` → `Chat/Max*Panel.tsx`.

*(Weitere Dubletten, aber ungefährlich, weil geteilt genutzt: `use-toast.ts` in
`components/ui/` und `hooks/`; `client.ts` in `integrations/supabase/` (Haupt-DB) und
`integrations/externalLaundry/` (externes Wäsche-System — zwei VERSCHIEDENE Clients,
nicht verwechseln).)*

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

### Frontend ↔ Backend: wer ruft welche Edge Function (Kopplung)

> Damit klar ist, was zusammenhängt, BEVOR man etwas ändert. Ändert man eine Edge
> Function, sind das die Frontend-Aufrufer, die man mitprüfen muss.

**Max-Kontrollfenster → Edge Function:**
| Frontend | ruft | Zweck |
|---|---|---|
| `Chat/MaxAblaeufePanel.tsx` | `max-ablaeufe-pruefen` | „Gegen Code prüfen" — gleicht `funktion`-Feld gegen echten Code ab |
| `hooks/useMorningSummary.ts` | `morning-summary` | Tagesübersicht (auch Tool `get_morning_summary`) |
| `Mail/MailPreviewProvider.tsx` | `send-guest-email` | Gmail-SMTP-Versand aus dem Vorschaufenster |

**`chat-assistant` (Max' Gehirn) ruft INTERN diese Edge Functions:**
`create-cleaning-task-for-booking`, `create-linen-order-for-booking`,
`generate-booking-linen-order`, `morning-summary`, `send-guest-email`.
→ Wer eine davon ändert, ändert Max' Verhalten mit — auch wenn `chat-assistant`
selbst unangetastet bleibt.

**`max_ablaeufe.weg` (Spalte, 17.07.2026):** Definiert je Schritt, WIE er läuft —
`ki` (Gemini interpretiert + wählt Funktion), `system` (Cron/DB-Trigger),
`mensch` (Handlungsschritt). Angezeigt im Panel `Chat/MaxAblaeufePanel.tsx`
(Badge unter dem Akteur). Seit 17.07. laufen E-Mail und Reschedule über den
KI-Weg (mode AUTO) — die früheren deterministischen Regex-Pfade in
`chat-assistant/serve()` sind entfernt.

### Backend: `supabase/functions/chat-assistant/index.ts` (≈ 3.550 Zeilen)
Modell: **Gemini 2.5 Flash**. Enthält Tool-Definitionen, Dispatcher,
execute-Funktionen, `buildEntityLinks` (Buttons), dynamischen System-Prompt.

**29 Werkzeuge:**
| Gruppe | Werkzeuge |
|---|---|
| Lesen | `search_bookings`, `search_cleaning_tasks`, `search_linen_orders`, `search_guests`, `search_houses`, `search_booking_inquiries`, `get_booking_full_context`, `get_dashboard_stats`, `get_revenue_stats`, `get_linen_overview`, `get_calendar_events`, `get_daily_overview` |
| Übersicht | `get_morning_summary` (→ Edge Fn `morning-summary`), `get_guest_contact_reminders`, `get_rating_reminders` |
| Wächter | `check_upcoming_bookings` (4 Prüfungen: fehlende Reinigung/Wäsche, Timing, offene Zahlung) |
| Anlegen | `create_cleaning_for_booking` (→ `create-cleaning-task-for-booking`, Status `draft`), `create_linen_for_booking` (→ `create-linen-order-for-booking`) |
| Ändern | `reschedule_cleaning` (Reinigungstermin → `draft`), **`reschedule_linen_delivery`** (Wäsche-Liefertermin → `offen`; Wäsche-Gegenstück, NEU 16.07.), **`reject_reschedule`** (Absage an Amela, setzt Reinigung zurück auf `scheduled`), **`update_provider_action`** (überfälligen Vorgang schließen / Frist verlängern — Ablauf `provider_keine_antwort`, NEU 16.07.), `update_linen_for_booking` (→ `generate-booking-linen-order`) |
| Anfragen | `accept_booking_inquiry`, `reject_booking_inquiry` |
| Kommunikation | `send_provider_message`, `read_provider_replies` |
| Sonstiges | `draft_guest_welcome_email`, `save_knowledge` |

> ## ⚠️ ZWEI DINGE, DIE MAN ÜBER MAX WISSEN MUSS
>
> **1. Die Soll-Definition steht in der DATENBANK, nicht hier.**
> Tabelle **`max_ablaeufe`** — je Fall: Schritt → Akteur → Funktion → Status.
> Vor jeder Arbeit an Max abfragen:
> `select * from max_ablaeufe order by aktion, variante, schritt_nr;`
> Der Code sagt, was IST. Die Tabelle sagt, was SEIN SOLL.
>
> **2. Nicht alles läuft über Gemini.**
> `serve()` hat **deterministische Pfade** (Regex-Erkennung), die Gemini komplett
> umgehen — für **Reschedule** (Pfade A/B/C) und die **Begrüßungs-E-Mail**.
> Wer nur die Tool-Definitionen liest, versteht den halben Assistenten. Eine
> Änderung an der Tool-Beschreibung von `reschedule_cleaning` wirkt auf
> *„verschiebe die Reinigung von Luca"* **überhaupt nicht**.
> Siehe `docs/chat-assistant-aenderungen.md`.

**ENTFERNT (14.07.2026):** `create_bulk_cleaning_tasks` und
`create_bulk_linen_orders` sind **restlos aus dem Code gelöscht** (224 Zeilen).
Grund: nie in `max_ablaeufe` definiert; erzeugten Sammel-Einträge ohne `booking_id`
→ unabschließbar. Der Dispatcher hat nur noch eine Sperre (Halluzinations-Schutz),
die auf die Einzel-Werkzeuge verweist. Auch die Labels in `MaxActionsPanel.tsx`
sind entfernt.

**Neu (14.07.2026):** `reject_reschedule` (Absage an Amela). Daher 27 Werkzeuge.

**Neu (16.07.2026):** `reschedule_linen_delivery` (Wäsche-Liefertermin verschieben,
Gegenstück zu `reschedule_cleaning`) und `update_provider_action` (überfälligen
Dienstleister-Vorgang schließen oder Frist verlängern — Ablauf `provider_keine_antwort`).
Daher **29 Werkzeuge**. Siehe Abschnitt „Wäsche-Reschedule-Kette" und
„Keine-Antwort-Ablauf" unten sowie `Session-2026-07-16`.

**Modell A (nicht verhandelbar):** Max handelt NUR nach ausdrücklicher Freigabe
durch Uli. Er liest Antworten nur auf Nachfrage.

### DB-Tabellen für Max
| Tabelle | Zweck |
|---|---|
| `max_actions` | **Protokoll** aller Max-Vorgänge. Felder: `action_type, status, booking_id, guest_name, details, related_task_id, `**`related_linen_order_id`** (NEU 16.07., Wäsche-Bezug — Gegenstück zu `related_task_id`)`, last_step, waiting_for, due_at`. Status: `wartet_uli`, `wartet_provider`, `ueberfaellig`, `abgeschlossen`, `beantwortet`. Angezeigt in `MaxActionsPanel.tsx`. |
| `max_ablaeufe` | **Soll-Vorgabe / Checkliste** (44 Zeilen). Spalten: `aktion, variante, schritt_nr, akteur, schritt, ergebnis_status, umsetzung, funktion, notiz`. **STEUERT MAX NICHT** — reine Doku, manuell gepflegt. Angezeigt in `MaxAblaeufePanel.tsx`. |
| `assistant_knowledge` | Was Max sich dauerhaft merken soll (`save_knowledge`). |
| `provider_messages` | Nachrichten Max ↔ Amela/Teuni. **`related_task_id` verknüpft mit der Reinigung** (Amela), **`related_linen_order_id` mit der Wäschebestellung** (Teuni, korrekt gesetzt seit 15.07. in `usePortalMessages.ts`) — Kern der geschlossenen Ketten. |
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

> **Die SQL liegt seit 13.07.2026 im Repo:** `supabase/sql/` (mit README, die den
> Ablauf als Diagramm erklärt). Vorher existierte diese Logik NUR in der Datenbank
> — nicht nachlesbar, nicht wiederherstellbar. Die Dateien sind idempotent; sie
> dokumentieren den Ist-Stand und dienen der Wiederherstellung.

| Trigger | Auf | Was |
|---|---|---|
| `trg_notify_amela_on_cleaning_release` | `service_tasks` | Bei `draft→scheduled`: benachrichtigt Amela (nur wenn sie via `related_task_id` einen „Neuer Termin: …"-Wunsch gestellt hatte) |
| `trg_close_max_action_on_cleaning_scheduled` | `service_tasks` | Bei `draft→scheduled`: schließt den offenen `max_actions`-Vorgang ab |
| `trg_aa_notify_teuni_on_linen_release` | `linen_orders` | **(NEU 16.07.)** Bei `offen→ausstehend`: benachrichtigt Teuni (nur wenn sie via `related_linen_order_id` einen „Neuer Liefertermin: …"-Wunsch gestellt hatte UND ein offener `reschedule_linen_delivery`-Vorgang existiert). **`aa`-Präfix ist Absicht:** erzwingt Lauf VOR dem close-Trigger, damit notify den offenen Vorgang sieht, bevor close ihn schließt. Wäsche-Gegenstück zu `trg_notify_amela_on_cleaning_release`. |
| `trg_close_max_action_on_linen_confirmed` | `linen_orders` | Bei `offen→ausstehend`: schließt den Wäsche-Vorgang ab. **(Erweitert 16.07.:** Filter kennt jetzt auch `reschedule_linen_delivery`, nicht nur create/update.) |
| `trg_close_max_action_on_guest_contacted` | `bookings` | Bei `guest_contact_status` → `contacted`/`not_required`: schließt den `welcome_email`-Vorgang ab |
| `trg_max_actions_on_provider_reply` | `provider_messages` | Antwortet Amela/Teuni: hängt „X hat geantwortet" an die Verlaufskette, Status → `beantwortet`. **(Erweitert 16.07.:** erkennt jetzt BEIDE Bezüge — `related_task_id` UND `related_linen_order_id`. Vorher stieg der Trigger bei Wäsche-Antworten aus, Max erfuhr nie davon.) |

> ⚠️ **Die beiden `linen`- und `guest`-Trigger standen bis 13.07.2026 in KEINEM
> Dokument** — sie existierten still in der DB. Beim Ziehen der Trigger-SQL sind
> sie aufgefallen.

### Wäsche-Reschedule-Kette (NEU 16.07.2026) — vollständig, live getestet

Das Wäsche-Gegenstück zur Reinigungs-Terminänderung. Teuni bittet um einen anderen
Liefertermin, Max verschiebt, Uli gibt frei, Teuni wird informiert. Kette
End-to-End am 16.07. an echten Daten durchgespielt und bestätigt.

**Ablauf (Definition: `max_ablaeufe`, aktion `reschedule_linen_delivery`):**
1. Teuni antwortet im Portal (Freitext, z. B. „Neuer Liefertermin: 22.01.2027")
   → Antwort trägt `related_linen_order_id` (`usePortalMessages.ts`, Fix 15.07.).
2. `trg_max_actions_on_provider_reply` erkennt den Wäsche-Bezug → Vorgang
   `beantwortet`. **Dieser Bezug ist der Einstieg — ohne ihn erführe Max nie von
   der Antwort.**
3. Max liest via `read_provider_replies` (liefert `typ=waesche`), **versteht** den
   Wunsch (Prompt-Block „📦 WÄSCHE-LIEFERTERMIN VERSCHIEBEN") und bietet an.
4. Nach Ulis „ja": Tool `reschedule_linen_delivery` → `delivery_date` neu,
   Status `offen`, `logMaxAction` mit `related_linen_order_id`.
5. Uli gibt frei (`offen→ausstehend`) → `trg_aa_notify_teuni…` informiert Teuni
   (nur bei echtem Wunsch) → `trg_close…` schließt den Vorgang.

**Kern-Symmetrie zur Reinigung:**

| | Reinigung (Amela) | Wäsche (Teuni) |
|---|---|---|
| Tabelle | `service_tasks` | `linen_orders` |
| Datum | `scheduled_date` | `delivery_date` |
| Status-Fluss | `draft → scheduled` | `offen → ausstehend` |
| Bezug | `related_task_id` | `related_linen_order_id` |
| Wunsch-Text | „Neuer Termin: …" | „Neuer Liefertermin: …" |
| notify-Trigger | `trg_notify_amela…` | `trg_aa_notify_teuni…` |

**SQL-Dateien:** `21_…add_related_linen_order_id`, `22_…reschedule_linen_triggers`,
`23_…provider_reply_linen`, `24_…finalisieren`. Details: `Session-2026-07-16`.

### Keine-Antwort-Ablauf (NEU 16.07.2026) — `provider_keine_antwort`

Wenn Amela oder Teuni **24 h** nach einer Frage nicht geantwortet hat, spricht Max
Uli beim Chat-Öffnen **aktiv** darauf an und fragt, wie vorzugehen ist. Uli
antwortet **frei** (kein festes Menü, Modell A); Max setzt es um.

**Ablauf (Definition: `max_ablaeufe`, aktion `provider_keine_antwort`):**
1. Max fragt → `due_at = Fragezeitpunkt + 24 h`, Status `wartet_provider`
   (in `send_provider_message`, `max-cleaning-reminders`, `max-linen-reminders`).
2. `overdue-watch` (Cron 06:15) → nach Ablauf Status `ueberfaellig`.
3. `morning-summary` zeigt es oben; beim Chat-Öffnen erscheint die Übersicht
   automatisch; Prompt-Block „⏰ KEINE ANTWORT VOM DIENSTLEISTER" macht daraus eine
   **aktive Nachfrage** statt einer bloßen Meldung.
4. Uli antwortet frei.
5. Max setzt um:
   · „nochmal fragen" → `send_provider_message` (neue 24-h-Frist)
   · „abschließen / lass es" → **`update_provider_action`** `aktion=schliessen`
   · „warte noch" → **`update_provider_action`** `aktion=frist_verlaengern`

**Frist:** stur 24 h ab Fragezeitpunkt, Wochenende mitgezählt (Entscheidung Uli).

**Wichtige Lektion aus dem Test:** Vor dem Bau von `update_provider_action` sagte Max
„ich betrachte es als erledigt", **ohne** dass sich in der DB etwas änderte — es gab
kein Werkzeug zum Schließen. Der Test (überfälliger Vorgang → „schließ das" → DB
prüfen) deckte es auf. „Deployed ≠ funktioniert", erneut bestätigt.

**Dateien:** `26_…provider_keine_antwort` (Definition), `27_…finalisieren`, Tool
`update_provider_action` + Frist-Änderung in `chat-assistant`/beide Reminder.

> ⚠️ **Stand des Systems (16.07.2026): NOCH NICHT im Realbetrieb.** Weder Amela
> noch Teuni hat je eine echte Anfrage beantwortet — alle bisherigen Portal-
> Nachrichten sind Test-/Handeingaben von Uli. Die Provider-Antwort-Buttons
> („Neuer Termin: …") existieren nur in einer `.txt`-Sicherung, nicht im aktiven
> Portal-Code, und werden real nicht genutzt. Die Ketten erkennen den Wunsch per
> **Regex im Freitext** bzw. über **Max' Sprachverständnis** — Buttons sind nicht
> nötig. Nicht aus Code-Präsenz auf reale Nutzung schließen.

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
| `chat-assistant` | **Max' Gehirn** (Gemini 2.5 Flash, 27 Werkzeuge) |
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

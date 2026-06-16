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
| AI-Assistent | `src/components/Chat/ChatAssistant.tsx` |
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
 ├─ EditCleaningTaskDialog.tsx
 └─ AutoCleaningSettingsCard.tsx          Auto-Reinigung-Einstellungen
```
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

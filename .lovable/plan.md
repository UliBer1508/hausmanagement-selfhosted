## Problem
Der Schließen-Button (X) in allen shadcn-Dialogen ist nur 16×16 px (`h-4 w-4`) ohne extra Padding — auf Touch-Geräten kaum zu treffen (WCAG verlangt min. 44×44 px). Gleiches Problem im `Sheet`-Component und in mehreren custom Bannern/Karten mit eigenen X-Buttons.

## Lösung: Zentralen Close-Button definieren und überall einsetzen

### 1. Neue Komponente `src/components/ui/close-button.tsx`
Ein wiederverwendbarer, finger-freundlicher Close-Button:
- Tap-Target **44×44 px** (`h-11 w-11`), Icon **20 px** (`h-5 w-5`)
- Variante `subtle` (für innerhalb von Dialogen, kein Hintergrund) und `solid` (Banner/Karten, mit `bg-muted hover:bg-accent`)
- Built-in `aria-label="Schließen"` und `<span class="sr-only">`
- Akzeptiert alle Button-Props (onClick etc.); kann als `asChild` für `DialogPrimitive.Close` benutzt werden

### 2. shadcn-Primitives anpassen
**`src/components/ui/dialog.tsx`** — eingebauten X-Button vergrößern:
- `right-4 top-4` bleibt
- `h-11 w-11 flex items-center justify-center rounded-md` statt aktuellem `rounded-sm` ohne Padding
- Icon `h-5 w-5`
- `aria-label="Schließen"`

**`src/components/ui/sheet.tsx`** — selbe Behandlung (h-11 w-11, h-5 w-5).

→ Damit profitieren **alle** Dialoge im Projekt (Edit-Dialoge, Create-Dialoge, AlertDialogs etc.) **automatisch**, ohne jede Stelle einzeln zu ändern.

### 3. Custom X-Buttons in Bannern/Karten ersetzen
Diese nutzen handgebauten X-Buttons (oft `size="icon"` = 36×36, oder kleiner). Auf `CloseButton` umstellen:

| Datei | Zweck |
|---|---|
| `src/components/Dashboard/RatingReminderBanner.tsx` | Banner-Dismiss |
| `src/components/Dashboard/GuestContactAlertBanner.tsx` | Banner-Dismiss |
| `src/components/Dashboard/BookingInquiryAlertBanner.tsx` | Banner-Dismiss |
| `src/components/Dashboard/CalendarTab.tsx` | Inline X |
| `src/components/Chat/ChatAssistant.tsx` | Chat-Window schließen |
| `src/components/Pricing/PricingDashboard.tsx` | X |
| `src/components/PWA/InstallPrompt.tsx` | Prompt schließen |
| `src/components/Operations/OperationsDashboard.tsx` | X |
| `src/components/Houses/LinenOrderEmailDialog.tsx` | X |
| `src/components/Tenants/ExcelUtilityImport.tsx` | X |
| `src/components/Tenants/RentHistoryDialog.tsx` | X |
| `src/components/Settings/GuestImportCard.tsx` | X |
| `src/components/ServicePortal/TeuniOrdersOverview.tsx` | X |
| `src/components/ServicePortal/LaundryInvoicesList.tsx` | X |
| `src/components/Bookings/CreateBookingDialog.tsx` | X |

### 4. Nicht ändern
- `src/components/ui/toast.tsx` — Toast-X bleibt klein (Sonner-Pattern, automatisch oben rechts).
- Die jeweilige **Logik** (onClose-Handler, State) wird nicht angefasst, nur das Markup des X-Buttons.

## Verifikation
- Mobile-Preview (390×): Edit-Dialog "Buchung bearbeiten" öffnen → X oben rechts ist deutlich größer und gut treffbar.
- Stichprobe Banner (z.B. RatingReminder) → X-Button ≥ 44×44.
- Keine visuellen Regressionen auf Desktop (Buttons sind bereits gut treffbar).

## Optionale Erweiterung (auf Anfrage)
Eigene Marken-Variante (Farbe, Schatten). Standardmäßig neutral (muted/foreground), passt zu allen Hintergründen.

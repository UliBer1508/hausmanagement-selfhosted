# Wäschebestellungs-Status Standard

**Version:** 1.0  
**Datum:** 2026-01-03  
**Status:** Verbindlich für gesamtes System

## Überblick

Dieses Dokument definiert den verbindlichen Standard für Wäschebestellungs-Status im gesamten System. Alle Komponenten, Hooks, Edge Functions und Datenbankabfragen MÜSSEN diese Definitionen verwenden.

## Verbindliche Status-Definitionen

| Status | DB-Wert | Bedeutung | Farbe/Badge |
|--------|---------|-----------|-------------|
| **Offen** | `offen` | Muss vom Benutzer bestätigt werden | 🟠 Amber/Orange |
| **Ausstehend** | `ausstehend` | Bestätigt, wartet auf Lieferung | 🟡 Gelb |
| **Geliefert** | `delivered` | Wurde geliefert | 🟢 Grün |
| **Storniert** | `cancelled` | Bestellung wurde storniert | 🔴 Rot |

## Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   OFFEN     │────▶│ AUSSTEHEND  │────▶│  DELIVERED  │
│ (erstellt)  │     │ (bestätigt) │     │ (geliefert) │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │
      │                   │
      ▼                   ▼
┌─────────────────────────────────────┐
│            CANCELLED                 │
│          (storniert)                │
└─────────────────────────────────────┘
```

1. **Bestellung erstellt** → Status: `offen`
2. **Benutzer klickt "Bestätigen"** → Status: `ausstehend`
3. **Lieferung erfolgt** → Status: `delivered`
4. **(Alternativ) Stornierung** → Status: `cancelled`

## Code-Referenz

### Zentrale Definition
Datei: `src/lib/linenOrderHelpers.ts`

```typescript
import { 
  LINEN_ORDER_STATUSES, 
  ALL_LINEN_ORDER_STATUSES,
  ACTIVE_LINEN_ORDER_STATUSES,
  isValidLinenOrderStatus,
  translateLinenOrderStatus,
  getLinenStatusBadge
} from '@/lib/linenOrderHelpers';
```

### Verwendung (RICHTIG)

```typescript
// Status-Vergleich
if (order.status === LINEN_ORDER_STATUSES.OFFEN) { ... }

// Status setzen
await supabase.from('linen_orders').update({ 
  status: LINEN_ORDER_STATUSES.AUSSTEHEND 
});

// Aktive Bestellungen abfragen
.in('status', ACTIVE_LINEN_ORDER_STATUSES)

// Status validieren
if (isValidLinenOrderStatus(userInput)) { ... }

// Status übersetzen
const label = translateLinenOrderStatus(order.status); // "Ausstehend"

// Badge-Styling
const { className, icon, label } = getLinenStatusBadge(order.status);
```

### Verwendung (FALSCH - VERBOTEN!)

```typescript
// ❌ Niemals Strings hardcoden:
if (order.status === 'offen') { ... }
if (order.status === 'pending') { ... }  // Legacy!
if (order.status === 'bestellt') { ... } // Legacy!

// ❌ Niemals alte Status verwenden:
.update({ status: 'pending' })     // Legacy!
.update({ status: 'bestellt' })    // Legacy!
.update({ status: 'assigned' })    // Legacy!
```

## Edge Functions

Da Edge Functions nicht aus `src/` importieren können, müssen die Status-Konstanten lokal definiert werden:

```typescript
// In jeder Edge Function die Status nutzt:
const LINEN_ORDER_STATUSES = {
  OFFEN: 'offen',
  AUSSTEHEND: 'ausstehend',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
} as const;
```

## Verbotene Werte (Legacy)

Diese Werte sind **NICHT MEHR ERLAUBT** und werden bei Datenbank-Migrationen automatisch korrigiert:

| Alter Wert | Ersetzt durch |
|------------|---------------|
| `pending` | `ausstehend` |
| `bestellt` | `ausstehend` |
| `assigned` | `ausstehend` |

## Betroffene Komponenten

### Frontend
- `src/components/Houses/LinenOrdersList.tsx`
- `src/components/Houses/LinenOrdersTab.tsx`
- `src/components/Houses/LinenOrderDialog.tsx`
- `src/components/Bookings/LaundryOrderCard.tsx` (beide Varianten `overview`/`full` — Status-Badge in BEIDEN über `getLinenStatusBadge()`)
- `src/components/Bookings/ConnectedBookingView.tsx`
- `src/components/Houses/AutoLinenOrderSettingsCard.tsx`

### Hooks
- `src/hooks/useExternalSync.ts`
- `src/hooks/useMorningSummary.ts`
- `src/hooks/useBookingLinenOrders.ts`

### Edge Functions
- `supabase/functions/auto-create-linen-orders/index.ts`
- `supabase/functions/sync-linen-order-external/index.ts`
- `supabase/functions/chat-assistant/index.ts`

## Änderungshistorie

| Datum | Version | Änderung |
|-------|---------|----------|
| 2026-01-03 | 1.0 | Initiale Standardisierung, Migration von `pending`/`bestellt` zu `ausstehend` |

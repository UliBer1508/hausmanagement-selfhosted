# Wäsche-Management Gesamtsystem

## Inhaltsverzeichnis

1. [Systemübersicht](#1-systemübersicht)
2. [Datenbank-Struktur](#2-datenbank-struktur)
3. [Edge Functions](#3-edge-functions)
4. [Automatisierung (Cron Jobs)](#4-automatisierung-cron-jobs)
5. [Status-Workflow](#5-status-workflow)
6. [Externe Synchronisation (Teuni Portal)](#6-externe-synchronisation-teuni-portal)
7. [Frontend-Architektur](#7-frontend-architektur)
8. [Berechnung der Wäschemengen](#8-berechnung-der-wäschemengen)
9. [Chat-Assistent Integration](#9-chat-assistent-integration)
10. [Konfiguration & Einstellungen](#10-konfiguration--einstellungen)
11. [Offene Punkte / TODO](#11-offene-punkte--todo)

---

## 1. Systemübersicht

### Zero-Stock-Prinzip

Das System folgt dem **Zero-Stock-Ansatz**:
- Jede Buchung erhält eine **exakte Wäschebestellung** basierend auf Gästezahl und Haus-Regeln
- **Kein automatischer Safety Buffer** in Buchungsbestellungen
- Buffer wird **separat** im Inventar als Mindestbestand verwaltet

### Kernprinzipien

| Prinzip | Beschreibung |
|---------|--------------|
| **Buchungsbezogen** | Jede Buchung = eigene Wäschebestellung |
| **Manuelle Kontrolle** | Alle Bestellungen werden vom User geprüft/bestätigt |
| **Externe Integration** | Optional: Sync zum Wäsche Oberpinzgau Portal |
| **KI-Unterstützung** | Chat-Assistent kann Bestellungen generieren und suchen |

### Bestellquellen (Order Sources)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORDER SOURCES                                │
├─────────────────────────────────────────────────────────────────────┤
│  manual                → Manuell über UI erstellt                   │
│  booking_required      → Über Buchungs-Dialog generiert             │
│  buffer_refill         → Buffer-Auffüllung (zukünftig)              │
│  auto_booking_lookahead → Automatisch durch Cron Job erstellt       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Datenbank-Struktur

### Haupt-Tabellen

#### `linen_orders` - Wäschebestellungen

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | UUID | Primärschlüssel |
| `house_id` | UUID | Referenz zum Haus |
| `booking_id` | UUID | Referenz zur Buchung (optional) |
| `status` | TEXT | offen, pending, delivered, cancelled |
| `order_source` | TEXT | manual, booking_required, buffer_refill, auto_booking_lookahead |
| `items` | JSONB | Bestellte Artikel mit Mengen und Farben |
| `delivery_date` | DATE | Gewünschtes Lieferdatum |
| `notes` | TEXT | Notizen zur Bestellung |
| `external_bestellnummer` | TEXT | Bestellnummer vom externen Portal |
| `external_synced_at` | TIMESTAMP | Zeitpunkt der externen Synchronisation |
| `email_sent_at` | TIMESTAMP | Zeitpunkt des E-Mail-Versands |
| `created_at` | TIMESTAMP | Erstellungszeitpunkt |
| `updated_at` | TIMESTAMP | Letzte Aktualisierung |

**Items JSONB Struktur:**
```json
{
  "bedding": { "quantity": 5, "color": "grey_striped" },
  "large_towels": { "quantity": 5, "color": "white" },
  "small_towels": { "quantity": 5, "color": "grey" },
  "bath_mats": { "quantity": 3, "color": "white" },
  "kitchen_towels": { "quantity": 2 }
}
```

#### `linen_set_definitions` - Wäsche-Regeln pro Haus

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | UUID | Primärschlüssel |
| `house_id` | UUID | Referenz zum Haus |
| `custom_categories` | JSONB | Flexible Artikel-Definition (bevorzugt) |
| `bedding_per_guest` | INT | Legacy: Bettwäsche pro Gast |
| `large_towels_per_guest` | INT | Legacy: Badetücher pro Gast |
| `small_towels_per_guest` | INT | Legacy: Handtücher pro Gast |
| `sauna_towels_per_guest` | INT | Legacy: Saunatücher pro Gast |
| `bath_mats_per_booking` | INT | Legacy: Badvorleger pro Buchung |
| `sink_towels_per_booking` | INT | Legacy: Waschbeckenhandtücher pro Buchung |
| `kitchen_towels_per_booking` | INT | Legacy: Geschirrtücher pro Buchung |

**custom_categories JSONB Struktur:**
```json
{
  "bedding": {
    "label": "Bettwäsche",
    "icon": "🛏️",
    "category": "Schlafbereich",
    "quantity": 1,
    "calculation_type": "per_guest",
    "availability": "always",
    "season": null,
    "color": null
  },
  "large_towels": {
    "label": "Badetücher",
    "icon": "🛁",
    "category": "Badbereich",
    "quantity": 1,
    "calculation_type": "per_guest",
    "availability": "always",
    "season": null,
    "color": "white"
  }
}
```

#### `linen_automation_settings` - Automatisierungs-Einstellungen

| Spalte | Typ | Default | Beschreibung |
|--------|-----|---------|--------------|
| `id` | UUID | - | Primärschlüssel |
| `is_enabled` | BOOLEAN | true | Automatische Erstellung aktiv? |
| `lookahead_bookings` | INT | 3 | Anzahl vorausschauender Buchungen |
| `delivery_advance_days` | INT | 1 | Tage vor Check-in für Lieferung |
| `min_advance_days` | INT | 7 | Min. Tage vor Check-in für Auto-Erstellung |
| `external_sync_enabled` | BOOLEAN | false | Automatische externe Sync? |
| `external_kundennummer` | TEXT | K470214 | Kundennummer beim externen Portal |
| `default_provider_id` | UUID | null | Standard-Dienstleister |

#### `ai_linen_settings` - Preise pro Haus

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | UUID | Primärschlüssel |
| `house_id` | UUID | Referenz zum Haus |
| `prices` | JSONB | Preise pro Artikeltyp |
| `safety_buffer` | NUMERIC | Buffer-Faktor (Standard: 1.20) |
| `reorder_threshold` | NUMERIC | Nachbestellschwelle (Standard: 0.80) |
| `lookahead_bookings` | INT | Vorausschau für KI-Analyse |

**prices JSONB Struktur:**
```json
{
  "bedding": 30,
  "large_towels": 18,
  "small_towels": 10,
  "sauna_towels": 20,
  "bath_mats": 15,
  "sink_towels": 8,
  "kitchen_towels": 12
}
```

#### `buffer_settings` - Mindestbestände pro Haus

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | UUID | Primärschlüssel |
| `house_id` | UUID | Referenz zum Haus |
| `min_buffer_stock` | JSONB | Mindestbestand pro Artikeltyp |

**min_buffer_stock JSONB Struktur:**
```json
{
  "bedding": 5,
  "large_towels": 5,
  "small_towels": 5,
  "sauna_towels": 5,
  "bath_mats": 3,
  "sink_towels": 3,
  "kitchen_towels": 2
}
```

#### `external_article_mapping` - Artikel-Mapping intern → extern

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | UUID | Primärschlüssel |
| `internal_item_key` | TEXT | Interner Schlüssel (z.B. "bedding_grey_striped") |
| `external_artikelnummer` | TEXT | Artikelnummer im externen Portal |
| `is_active` | BOOLEAN | Mapping aktiv? |

---

## 3. Edge Functions

### Übersicht

| Function | Trigger | Beschreibung |
|----------|---------|--------------|
| `generate-booking-linen-order` | Manuell, Chat | Berechnet exakte Wäsche für EINE Buchung |
| `auto-create-linen-orders` | **Cron (6:00 Uhr)** | Erstellt "offen" Bestellungen automatisch |
| `check-booking-linen-orders` | UI-Abfrage | Prüft Status aller Buchungen eines Hauses |
| `sync-linen-order-external` | Manuell | Überträgt Bestellung ans externe Portal |
| `optimize-linen-inventory` | Chat, UI | KI-Analyse mit Buffer-Status |
| `sync-laundry-invoices` | Manuell | Lädt Rechnungen vom externen Portal |

### `generate-booking-linen-order`

**Zweck:** Berechnet die exakte Wäschemenge für eine einzelne Buchung.

**Input:**
```json
{ "booking_id": "uuid" }
```

**Logik:**
1. Lädt Buchung mit Haus-Daten
2. Lädt `linen_set_definitions` für das Haus
3. Prüft `custom_categories` (bevorzugt) oder Legacy-Spalten
4. Berechnet pro Artikel: `(Gäste × per_guest) + per_booking`
5. Berücksichtigt saisonale Verfügbarkeit (Winter: Nov-März, Sommer: Apr-Okt)
6. Lädt Preise aus `ai_linen_settings`
7. Berechnet Gesamtkosten

**Output:**
```json
{
  "success": true,
  "booking": { "id": "...", "guest_name": "...", "check_in": "...", "number_of_guests": 5 },
  "house": { "id": "...", "name": "Wald Chalet" },
  "orderItems": {
    "bedding": { "quantity": 5, "color": "grey_striped" },
    "large_towels": { "quantity": 5, "color": "white" }
  },
  "costs": {
    "items": [
      { "key": "bedding", "quantity": 5, "unit_price": 30, "total": 150 }
    ],
    "total": 461
  }
}
```

### `auto-create-linen-orders`

**Zweck:** Erstellt automatisch Wäschebestellungen für kommende Buchungen.

**Trigger:** Cron Job täglich um 6:00 Uhr

**Logik:**
```
1. Prüfe linen_automation_settings.is_enabled
   └─ Wenn false → Abbruch

2. Lade alle touristischen Häuser (rental_type = 'tourist')

3. Pro Haus:
   a. Lade nächste N Buchungen (lookahead_bookings, default: 3)
   b. Filtere: status = 'confirmed', check_in >= heute
   
   c. Pro Buchung:
      i.   Prüfe: Existiert bereits linen_order (außer cancelled)?
           └─ Wenn ja → Überspringen
      
      ii.  Berechne: Tage bis Check-in
           └─ Wenn < min_advance_days (7) → Überspringen (zu kurzfristig)
      
      iii. Rufe generate-booking-linen-order auf
      
      iv.  Berechne delivery_date:
           └─ check_in - delivery_advance_days (1)
      
      v.   Erstelle linen_order:
           - status: 'offen'
           - order_source: 'auto_booking_lookahead'
           - items: aus generate-booking-linen-order
           - delivery_date: berechnet
           - notes: "Automatisch erstellt für [Gast]"

4. Rückgabe: Zusammenfassung (erstellt, übersprungen, Fehler)
```

### `sync-linen-order-external`

**Zweck:** Überträgt eine Bestellung zum Wäsche Oberpinzgau Portal.

**Voraussetzungen:**
- `external_sync_enabled = true` in automation settings
- Haus hat `external_objektnummer`
- Bestellung hat `status = 'pending'`
- Artikel-Mapping existiert in `external_article_mapping`

**Logik:**
```
1. Prüfe external_sync_enabled
2. Lade Bestellung mit Buchung und Haus
3. Prüfe: status = 'pending' UND external_bestellnummer IS NULL
4. Lade externe Stammdaten (Kunde, Objekt, Artikel-Katalog)
5. Mappe interne Artikel zu externen Artikelnummern (inkl. Farbe)
6. Erstelle waeschebestellung im externen Portal
7. Erstelle bestellpositionen für jeden Artikel
8. Erstelle bestellung_history Eintrag
9. Update interne Bestellung:
   - external_bestellnummer (vom Portal generiert)
   - external_synced_at
```

---

## 4. Automatisierung (Cron Jobs)

### auto-create-linen-orders-daily

```
┌──────────────────────────────────────────────────────────────┐
│ Cron Job: auto-create-linen-orders-daily                     │
├──────────────────────────────────────────────────────────────┤
│ Schedule:     0 6 * * * (täglich 6:00 Uhr UTC)               │
│ Job-ID:       11                                             │
│ Aktion:       HTTP POST → auto-create-linen-orders           │
│ Ergebnis:     Bestellungen mit status='offen' erstellt       │
└──────────────────────────────────────────────────────────────┘
```

### Konfiguration (SQL)

```sql
SELECT cron.schedule(
  'auto-create-linen-orders-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://usblrulkcgucxtkhugck.supabase.co/functions/v1/auto-create-linen-orders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ..."}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## 5. Status-Workflow

### Diagramm

```
                    ┌─────────┐
                    │  offen  │ ← Automatisch erstellt (Cron)
                    │         │   oder manuell ohne Bestätigung
                    └────┬────┘
                         │ 
                         │ User prüft und bestätigt
                         │ (Status-Änderung in UI)
                         ▼
                    ┌────────────┐
                    │ ausstehend │ ← Bereit für externe Sync
                    │            │   "An Portal senden" möglich
                    └─────┬──────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
           ▼                           ▼
    ┌───────────┐               ┌───────────┐
    │ delivered │               │ cancelled │
    │           │               │           │
    │ Geliefert │               │ Storniert │
    └───────────┘               └───────────┘
```

### Status-Bedeutungen

> **Hinweis (korrigiert 16.06.2026):** Der verbindliche Status-Wert ist
> `ausstehend` (nicht `pending`). `pending`/`bestellt` sind Legacy und wurden
> migriert. Maßgeblich ist `docs/Linen-Order-Status-Standard.md` und
> `src/lib/linenOrderHelpers.ts`.

| Status | Bedeutung | UI-Darstellung | Aktionen möglich |
|--------|-----------|----------------|------------------|
| `offen` | Automatisch erstellt, wartet auf Prüfung | 📝 Gelb/Orange Badge | Bearbeiten, Bestätigen, Stornieren |
| `ausstehend` | Vom User bestätigt, bereit für Sync | ⏳ Blau Badge | An Portal senden, Bearbeiten, Stornieren |
| `delivered` | Geliefert/Abgeschlossen | ✅ Grün Badge | Nur ansehen |
| `cancelled` | Storniert | ❌ Rot Badge | Nur ansehen |

### Dashboard-Alert

Ein pulsierendes 🔔 Bell-Icon erscheint im Dashboard, wenn **offene Bestellungen** existieren, die auf Bestätigung warten.

---

## 6. Externe Synchronisation (Teuni Portal)

### Architektur

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Interne Datenbank     │         │   Externe Datenbank     │
│   (Supabase Logik)      │         │   (Wäsche Oberpinzgau)  │
├─────────────────────────┤         ├─────────────────────────┤
│                         │         │                         │
│  linen_orders           │ ──────► │  waeschebestellungen    │
│    └─ items JSONB       │         │    └─ bestellpositionen │
│    └─ booking data      │         │    └─ gastname          │
│                         │         │    └─ check_in/out      │
│                         │         │    └─ lieferdatum       │
│                         │ ◄────── │    └─ bestellnummer     │
│  external_bestellnummer │         │       (auto-generated)  │
│                         │         │                         │
│  external_article_      │         │  waescheartikel         │
│  mapping                │ ──────► │    └─ artikelnummer     │
│                         │         │    └─ farbe             │
│                         │         │                         │
│  laundry_invoices       │ ◄────── │  rechnungen             │
│  (read-only sync)       │         │                         │
└─────────────────────────┘         └─────────────────────────┘
```

### Artikel-Mapping

Das Mapping verbindet interne Artikel-Keys mit externen Artikelnummern unter Berücksichtigung der Farbe:

```
Interner Key          Farbe            Externer Artikel
─────────────────────────────────────────────────────────
bedding              grey_striped  →   WA001
bedding              white_striped →   WA005
large_towels         white         →   WA010
large_towels         grey          →   WA011
```

**Mapping-Logik:**
1. Konstruiere `mappingKey = itemKey_color` (z.B. "bedding_grey_striped")
2. Suche in `external_article_mapping` nach `internal_item_key = mappingKey`
3. Fallback: Suche nach `internal_item_key = itemKey` (ohne Farbe)

### Sync-Prozess

```
1. User klickt "An Portal senden" (nur bei status='pending')

2. sync-linen-order-external wird aufgerufen:
   a. Validierung (status, Haus-Objektnummer, Mapping)
   b. Externe Stammdaten laden (Kunde, Objekt)
   c. Artikel mappen (intern → extern)
   
3. Externe Datenbank:
   a. INSERT INTO waeschebestellungen
      - kunde_id, objekt_id
      - gastname, check_in, check_out, anzahl_personen
      - lieferdatum, status='neu'
   b. INSERT INTO bestellpositionen (pro Artikel)
      - bestellung_id, artikel_id, menge
   c. INSERT INTO bestellung_history
   
4. Bestellnummer wird automatisch vom Portal generiert

5. Interne Bestellung wird aktualisiert:
   - external_bestellnummer = generierte Nummer
   - external_synced_at = jetzt
```

---

## 7. Frontend-Architektur

### Hooks

| Hook | Datei | Funktion |
|------|-------|----------|
| `useBookingLinenOrders` | `src/hooks/useBookingLinenOrders.ts` | Lädt/erstellt Bestellungen pro Haus, Status-Check |
| `useLinenAutomationSettings` | `src/hooks/useLinenAutomationSettings.ts` | Globale Automatisierungs-Einstellungen |
| `useExternalSync` | `src/hooks/useExternalSync.ts` | Externe Synchronisation zu Teuni Portal |
| `useLinenManagement` | `src/hooks/useLinenManagement.ts` | Inventar, Demand-Analyse, Legacy-Funktionen |
| `useOptimizedLinenManagement` | `src/hooks/useOptimizedLinenManagement.ts` | KI-Optimierung, Buffer-Status |
| `useExternalArticleMapping` | `src/hooks/useExternalArticleMapping.ts` | Artikel-Mapping verwalten |
| `useExternalOrderStatus` | `src/hooks/useExternalOrderStatus.ts` | Status vom externen Portal laden |
| `useLinenAI` | `src/hooks/useLinenAI.ts` | KI-Einstellungen und Preise |

### UI-Komponenten

| Komponente | Pfad | Funktion |
|------------|------|----------|
| `SmartLinenDashboardWithTabs` | `src/components/Houses/` | Hauptansicht mit allen Tabs |
| `BookingLinenOverview` | `src/components/Houses/` | Übersicht/Fehlend/Aktiv Tabs |
| `LinenOrderDialog` | `src/components/Houses/` | Bestellung erstellen/bearbeiten/Preview |
| `LaundryOrderCard` | `src/components/Bookings/` | Einzelne Bestellung als Card. `variant="overview"` (Dashboard-Übersicht, kompakt) / `variant="full"` (Wäsche-Tab, vollständig). Siehe `docs/Karten-Namenskonvention.md`. |
| `LinenOrdersList` | `src/components/Houses/` | Liste aller Bestellungen |
| `AutoLinenOrderSettingsCard` | `src/components/Houses/` | Automatisierung konfigurieren |
| `LinenSetRulesTab` | `src/components/Houses/` | Wäsche-Regeln bearbeiten |
| `LinenPricesTab` | `src/components/Houses/` | Preise pro Artikel |
| `LinenInventoryDialog` | `src/components/Houses/` | Inventar verwalten |

### Komponenten-Hierarchie

```
OriginalDashboard (Route: /)
└── Tab: "Wäsche"
    ├── LinenDashboard
    │   ├── AutoLinenOrderSettingsCard (Automatisierung)
    │   ├── HouseCard × N (pro touristisches Haus)
    │   │   └── LinenOrderDialog (bei Klick)
    │   └── LinenOrdersList (alle Bestellungen)
    │
    └── SmartLinenDashboardWithTabs (Route: /laundry)
        ├── Tab: Übersicht
        │   └── BookingLinenOverview
        ├── Tab: Wäsche-Regeln
        │   └── LinenSetRulesTab
        ├── Tab: Preise
        │   └── LinenPricesTab
        └── Tab: Inventar
            └── LinenInventoryDialog
```

---

## 8. Berechnung der Wäschemengen

### Formel

```
Pro Wäschetyp:
  Menge = (Anzahl_Gäste × per_guest_Regel) + per_booking_Regel
```

### Beispiel (5 Gäste, Wald Chalet)

```
Bettwäsche:           5 × 1 + 0 = 5 Stück
Badetücher:           5 × 1 + 0 = 5 Stück
Handtücher:           5 × 1 + 0 = 5 Stück
Saunatücher:          5 × 1 + 0 = 5 Stück
Waschbeckenhandtücher: 0 × 0 + 3 = 3 Stück (pro Buchung)
Badvorleger:          0 × 0 + 3 = 3 Stück (pro Buchung)
Geschirrtücher:       0 × 0 + 2 = 2 Stück (pro Buchung)
```

### Datenquellen (Priorität)

1. **`custom_categories` JSONB** (bevorzugt)
   - Dynamische Artikel mit flexibler Definition
   - Unterstützt beliebige neue Artikeltypen
   - Saisonale Verfügbarkeit (Winter/Sommer)

2. **Legacy-Spalten** (Fallback)
   - `bedding_per_guest`, `large_towels_per_guest`, etc.
   - Wird bei Migration automatisch zu `custom_categories` konvertiert

### Saisonale Verfügbarkeit

```
Artikel-Einstellung:
  availability: "always" | "seasonal"
  season: "winter" | "summer" | null

Prüfung bei Berechnung:
  - Check-in Monat ermitteln
  - Winter: November - März (Monate 11, 12, 1, 2, 3)
  - Sommer: April - Oktober (Monate 4-10)
  - Wenn availability="seasonal" UND season nicht passt → Menge = 0
```

### Kostenberechnung

```
Pro Artikel:
  Kosten = Menge × Einzelpreis (aus ai_linen_settings.prices)

Gesamt:
  Total = Σ (alle Artikel-Kosten)
```

**Hinweis:** Preise sind nur für interne Kostenkalkulation. Sie werden NICHT an externe Dienste übermittelt.

---

## 9. Chat-Assistent Integration

### Verfügbare Tools

| Tool | Trigger-Beispiele | Funktion |
|------|-------------------|----------|
| `search_linen_orders` | "Müssen wir Wäsche bestellen?", "Offene Bestellungen?" | Sucht Bestellungen nach Status |
| `generate_booking_linen_order` | "Was brauche ich für Dr. Mirtschink?" | Generiert Bestellung für Buchung |
| `get_house_linen_status` | "Wie ist der Buffer-Status?" | Zeigt Inventar + KI-Empfehlungen |
| `get_linen_overview` | "Wäsche-Übersicht" | Globale Statusübersicht aller Häuser |

### Tool-Definitionen

#### `search_linen_orders`

```json
{
  "name": "search_linen_orders",
  "parameters": {
    "status": "offen | pending | delivered | cancelled",
    "house_id": "uuid (optional)",
    "date_from": "YYYY-MM-DD (optional)",
    "date_to": "YYYY-MM-DD (optional)"
  }
}
```

#### `generate_booking_linen_order`

```json
{
  "name": "generate_booking_linen_order",
  "parameters": {
    "booking_id": "uuid (required)"
  }
}
```

### Beispiel-Dialoge

**Frage:** "Müssen wir Wäsche bestellen?"

**Antwort:**
```
🧺 Offene Wäschebestellungen:

📦 2 Bestellungen mit Status 'offen':
1. Familie Schmidt (Wald Chalet)
   • Check-in: 20.12.2025
   • 5 Gäste
   • Erstellt: 16.12.2025

2. Dr. Mirtschink (Bergblick Chalet)
   • Check-in: 22.12.2025
   • 4 Gäste
   • Erstellt: 16.12.2025

💡 Diese Bestellungen warten auf deine Prüfung.
   Bestätige sie, um sie ans Portal zu senden.
```

**Frage:** "Was brauche ich für Familie Schmidt?"

**Antwort:**
```
🧺 Wäschebestellung für Familie Schmidt (5 Personen):

📦 BESTELLUNG:
• 5x Bettwäsche (je 30 EUR) → 150 EUR
• 5x Badetücher (je 18 EUR) → 90 EUR
• 5x Handtücher (je 10 EUR) → 50 EUR
• 5x Saunatücher (je 20 EUR) → 100 EUR
• 3x Waschbeckenhandtücher (je 8 EUR) → 24 EUR
• 3x Badvorleger (je 15 EUR) → 45 EUR
• 2x Geschirrtücher (je 12 EUR) → 24 EUR

💶 KOSTEN:
Gesamt: 483 EUR

💡 HINWEIS:
Dies ist nur für diese Buchung berechnet.
Dein Safety Buffer im Inventar bleibt unberührt.
```

---

## 10. Konfiguration & Einstellungen

### Aktuelle Automatisierungs-Einstellungen

```json
{
  "is_enabled": true,
  "lookahead_bookings": 3,
  "min_advance_days": 7,
  "delivery_advance_days": 1,
  "external_sync_enabled": false,
  "external_kundennummer": "K470214"
}
```

### Status-Werte (linen_orders.status)

| Wert | DB CHECK | Beschreibung |
|------|----------|--------------|
| `offen` | ✅ | Automatisch erstellt, wartet auf Prüfung |
| `pending` | ✅ | Bestätigt, bereit für Sync |
| `delivered` | ✅ | Geliefert |
| `cancelled` | ✅ | Storniert |

### Order-Source-Werte (linen_orders.order_source)

| Wert | DB CHECK | Beschreibung |
|------|----------|--------------|
| `manual` | ✅ | Manuell erstellt |
| `booking_required` | ✅ | Aus Buchungs-Dialog |
| `buffer_refill` | ✅ | Buffer-Auffüllung |
| `auto_booking_lookahead` | ✅ | Automatisch durch Cron |

### UI-Einstellungen (AutoLinenOrderSettingsCard)

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| An/Aus | Automatische Erstellung aktivieren | An |
| Vorausschau | Anzahl Buchungen im Voraus | 3 |
| Min. Vorlauf | Mindest-Tage vor Check-in | 7 |
| Liefervorlauf | Tage vor Check-in für Lieferdatum | 1 |

---

## 11. Offene Punkte / TODO

### Hohe Priorität

1. **Externe Sync automatisieren**
   - [ ] Cron Job für `pending` → Portal (nach Status-Bestätigung)
   - [ ] Oder: Trigger bei Status-Änderung `offen` → `pending`

2. **Buffer-Auffüllung implementieren**
   - [ ] Separater Workflow für Buffer-Bestellungen
   - [ ] UI im Inventar-Tab für Buffer-Defizite
   - [ ] `order_source = 'buffer_refill'`

### Mittlere Priorität

3. **Dashboard-Verbesserungen**
   - [x] 🔔 Alert für offene Bestellungen (implementiert)
   - [ ] Quick-Actions für häufige Aktionen
   - [ ] Batch-Bestätigung mehrerer Bestellungen

4. **Externe Integration erweitern**
   - [ ] Automatische Status-Synchronisation (extern → intern)
   - [ ] Tracking-Informationen anzeigen
   - [ ] Lieferschein-PDF generieren

### Niedrige Priorität

5. **Analytics & Reporting**
   - [ ] Wäsche-Kosten pro Monat/Quartal
   - [ ] Verbrauchsstatistiken pro Haus
   - [ ] Prognose basierend auf Buchungstrends

6. **Mobile Optimierung**
   - [ ] PWA-Unterstützung für Bestellbestätigung
   - [ ] Push-Notifications für offene Bestellungen

---

## Anhang: Datei-Referenzen

### Edge Functions
- `supabase/functions/generate-booking-linen-order/index.ts`
- `supabase/functions/auto-create-linen-orders/index.ts`
- `supabase/functions/check-booking-linen-orders/index.ts`
- `supabase/functions/sync-linen-order-external/index.ts`
- `supabase/functions/optimize-linen-inventory/index.ts`
- `supabase/functions/sync-laundry-invoices/index.ts`

### Hooks
- `src/hooks/useBookingLinenOrders.ts`
- `src/hooks/useLinenAutomationSettings.ts`
- `src/hooks/useExternalSync.ts`
- `src/hooks/useLinenManagement.ts`
- `src/hooks/useOptimizedLinenManagement.ts`
- `src/hooks/useExternalArticleMapping.ts`
- `src/hooks/useExternalOrderStatus.ts`
- `src/hooks/useLinenAI.ts`

### Komponenten
- `src/components/Houses/SmartLinenDashboardWithTabs.tsx`
- `src/components/Houses/BookingLinenOverview.tsx`
- `src/components/Houses/LinenOrderDialog.tsx`
- `src/components/Houses/LinenOrdersList.tsx`
- `src/components/Houses/AutoLinenOrderSettingsCard.tsx`
- `src/components/Houses/LinenSetRulesTab.tsx`
- `src/components/Houses/LinenPricesTab.tsx`
- `src/components/Bookings/LaundryOrderCard.tsx`

### Typen
- `src/types/linen.ts`
- `src/integrations/supabase/types.ts`

### Helpers
- `src/lib/linenOrderHelpers.ts`
- `src/lib/linenCalculations.ts` (falls vorhanden)

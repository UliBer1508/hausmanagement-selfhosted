# Wäschebestellungs-Logik: Zero-Stock-Ansatz mit Buffer-Trennung

**Version:** 2.0  
**Erstellt:** 2025-10-10  
**Dokumentations-Typ:** Systemarchitektur & Geschäftslogik  

---

## 📋 Inhaltsverzeichnis

1. [Core Principles](#1-core-principles)
2. [Linen Set Definition](#2-linen-set-definition)
3. [Datenbankstruktur](#3-datenbankstruktur)
4. [Logik-Trennung](#4-logik-trennung)
5. [Unterschiede Alt vs. Neu](#5-unterschiede-alt-vs-neu)
6. [User Workflows](#6-user-workflows)
7. [AI Integration](#7-ai-integration)
8. [Chat-Assistent Tools](#8-chat-assistent-tools)
9. [Preisberechnung & Kosten](#9-preisberechnung--kosten)
10. [Error Handling](#10-error-handling)
11. [Zukünftige Erweiterungen](#11-zukünftige-erweiterungen)
12. [Technische Implementierung](#12-technische-implementierung)
13. [Validierungs-Checkliste](#13-validierungs-checkliste)

---

## 1. Core Principles

### Zero-Stock-Ansatz für Buchungen
**Prinzip:** Für jede Buchung wird **exakt** die benötigte Menge Wäsche bestellt. Es gibt **keine** automatische Nachbestellung basierend auf Schwellenwerten.

**Vorteile:**
- ✅ Klare Zuordnung: Jede Bestellung ist einer Buchung zugeordnet
- ✅ Volle Kontrolle: Nutzer entscheidet welche Bestellung abgesendet wird
- ✅ Keine Überbestellungen durch falsche KI-Prognosen
- ✅ Transparente Kostenrechnung pro Buchung

### Safety Buffer: Separate Verwaltung
**Prinzip:** Der Safety Buffer ist **nicht** Teil der Buchungsbestellungen. Er wird im Inventar vorgehalten und separat überwacht.

**Funktionsweise:**
```
┌─────────────────────────────────────┐
│ INVENTAR                            │
├─────────────────────────────────────┤
│ • Verfügbare Wäsche                 │
│ • Safety Buffer (min. 5 Stück)     │
│ • In Verwendung                     │
│ • In Reinigung                      │
└─────────────────────────────────────┘
         ↓                    ↓
   ┌──────────┐        ┌──────────┐
   │ Buchung  │        │  Buffer  │
   │ Bestellung│        │ Auffüllung│
   └──────────┘        └──────────┘
   NUR für            NUR wenn
   diese Buchung      Buffer < Min
```

### Keine automatischen Bestellungen
**Prinzip:** Es gibt **keine** automatischen Bestellungen. Jede Bestellung wird manuell durch den Nutzer ausgelöst.

---

## 2. Linen Set Definition

### Beispiel: Dr. Daniel Mirtschink (5 Gäste)

```javascript
// Linen-Set-Definition für ein Haus
{
  house_id: "abc123",
  bedding_per_guest: 1,
  large_towels_per_guest: 1,
  small_towels_per_guest: 1,
  sauna_towels_per_guest: 1,
  sink_towels_per_booking: 3,
  bath_mats_per_booking: 3,
  kitchen_towels_per_booking: 2
}

// Berechnung für 5 Gäste:
Bestellung = (Gäste × per_guest_rules) + per_booking_rules

Ergebnis:
• 5x Bettwäsche (5 × 1)
• 5x Große Handtücher (5 × 1)
• 5x Kleine Handtücher (5 × 1)
• 5x Saunahandtücher (5 × 1)
• 3x Waschbeckenhandtücher (1 × 3)
• 3x Badvorleger (1 × 3)
• 2x Küchenhandtücher (1 × 2)

Gesamt: 28 Teile
```

---

## 3. Datenbankstruktur

### Tabelle: `linen_set_definitions`
Definiert die Regeln pro Haus.

```sql
CREATE TABLE linen_set_definitions (
  id UUID PRIMARY KEY,
  house_id UUID REFERENCES houses(id),
  bedding_per_guest INTEGER DEFAULT 1,
  large_towels_per_guest INTEGER DEFAULT 1,
  small_towels_per_guest INTEGER DEFAULT 1,
  sauna_towels_per_guest INTEGER DEFAULT 1,
  sink_towels_per_booking INTEGER DEFAULT 1,
  bath_mats_per_booking INTEGER DEFAULT 1,
  kitchen_towels_per_booking INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabelle: `buffer_settings` (NEU)
Definiert Mindestbestände pro Haus.

```sql
CREATE TABLE buffer_settings (
  id UUID PRIMARY KEY,
  house_id UUID REFERENCES houses(id) UNIQUE,
  min_buffer_stock JSONB DEFAULT '{
    "bedding": 5,
    "large_towels": 5,
    "small_towels": 5,
    "sauna_towels": 5,
    "bath_mats": 3,
    "sink_towels": 3,
    "kitchen_towels": 2
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Logik-Trennung

### A) Buchungs-Bestellungen

**Edge Function:** `generate-booking-linen-order`

**Input:**
```json
{
  "booking_id": "uuid-der-buchung"
}
```

**Output:**
```json
{
  "success": true,
  "booking": {
    "id": "...",
    "guest_name": "Dr. Daniel Mirtschink",
    "number_of_guests": 5,
    "check_in": "2025-10-15",
    "check_out": "2025-10-20"
  },
  "order_items": {
    "bedding": 5,
    "large_towels": 5,
    "small_towels": 5,
    "sauna_towels": 5,
    "sink_towels": 3,
    "bath_mats": 3,
    "kitchen_towels": 2
  },
  "total_items": 28,
  "estimated_cost": 518.00,
  "currency": "EUR",
  "note": "Bestellung NUR für diese Buchung - Safety Buffer im Inventar bleibt unberührt"
}
```

**Wichtig:** ⚠️ Diese Bestellung enthält **KEINEN** Safety Buffer!

---

### B) Buffer-Verwaltung

**Funktion:** `checkBufferStatus` (in `optimize-linen-inventory`)

**Logik:**
```typescript
function checkBufferStatus(currentStock, minBufferStock) {
  const deficit = {};
  let needsRefill = false;

  Object.keys(minBufferStock).forEach(item => {
    const current = currentStock[item] || 0;
    const minimum = minBufferStock[item];
    
    if (current < minimum) {
      deficit[item] = {
        current_buffer: current,
        min_buffer: minimum,
        refill_quantity: minimum - current
      };
      needsRefill = true;
    }
  });

  return {
    needs_refill: needsRefill,
    deficit: deficit,
    status: needsRefill ? 'critical' : 'ok'
  };
}
```

**Output-Beispiel:**
```json
{
  "needs_refill": true,
  "deficit": {
    "bedding": {
      "current_buffer": 3,
      "min_buffer": 5,
      "refill_quantity": 2
    },
    "large_towels": {
      "current_buffer": 2,
      "min_buffer": 5,
      "refill_quantity": 3
    }
  },
  "status": "critical"
}
```

---

## 5. Unterschiede Alt vs. Neu

| Aspekt | Alt (bis 09.10.2025) | Neu (ab 10.10.2025) |
|--------|---------------------|---------------------|
| **Bestelllogik** | Aggregiert für alle kommenden Buchungen | Pro Buchung einzeln |
| **Safety Buffer** | In Bestellung eingerechnet (`forecasted × 1.2`) | Nur im Inventar vorgehalten |
| **Bestellauslöser** | Threshold-basiert (< 80% Sollbestand) | Manuell pro Buchung |
| **Automatisierung** | KI schlägt Bestellung vor | Nutzer erstellt Bestellung |
| **Buffer-Verwaltung** | Nicht separat | Eigene Überwachung + Bestellung |
| **Transparenz** | Unklar woher Mengen kommen | Klare Zuordnung zu Buchung |
| **Chat-Assistent** | "Was brauche ich insgesamt?" | "Was brauche ich für [Buchung]?" |

---

## 6. User Workflows

### Workflow 1: Neue Buchung erstellen

```
1. User öffnet Buchungsformular
2. Gibt Gastdaten ein (z.B. Dr. Mirtschink, 5 Gäste)
3. Wählt Check-in / Check-out
4. Speichert Buchung

Optional (im Edit-Mode):
5. Klickt "Wäschebestellung für diese Buchung erstellen"
6. System berechnet exakte Menge (28 Teile)
7. Dialog zeigt Bestellung mit Kosten (518 EUR)
8. User kann Bestellung absenden oder abbrechen
```

**UI-Element:**
```jsx
<Button onClick={handleGenerateLinenOrder}>
  <ShoppingCart /> Wäschebestellung für diese Buchung erstellen
</Button>
```

---

### Workflow 2: Buffer-Status prüfen

```
1. User öffnet Smart Linen Dashboard
2. Wählt "Safety Buffer Status" Tab
3. System zeigt:
   - Buffer OK: Grüne Meldung "Buffer ausreichend"
   - Buffer kritisch: Rote Warnung mit Defizit-Liste
4. Bei kritischem Buffer:
   - Button "Buffer-Auffüllungs-Bestellung erstellen"
   - Zeigt benötigte Mengen zum Auffüllen
```

**UI-Element:**
```jsx
{bufferStatus.needs_refill ? (
  <Alert variant="destructive">
    <AlertTriangle />
    <AlertDescription>
      Buffer unter Minimum!
      • Bettwäsche: 3 / 5 (2 nachbestellen)
      • Große Handtücher: 2 / 5 (3 nachbestellen)
      <Button onClick={handleCreateBufferRefill}>
        Buffer-Auffüllungs-Bestellung erstellen
      </Button>
    </AlertDescription>
  </Alert>
) : (
  <p className="text-green-600">✅ Buffer ausreichend</p>
)}
```

---

### Workflow 3: Chat-Assistent nutzen

**Szenario A: Buchungsbezogene Anfrage**
```
User: "Was brauche ich für Anke Wiggers?"

Assistent:
1. Ruft search_bookings auf → findet Buchungs-ID
2. Ruft generate_booking_linen_order auf mit booking_id
3. Antwortet:

"🧺 Wäschebestellung für Anke Wiggers (3 Personen):

📦 BESTELLUNG:
• 3x Bettwäsche (je 30 EUR)
• 3x Große Handtücher (je 18 EUR)
• 3x Kleine Handtücher (je 10 EUR)
• 3x Saunahandtücher (je 20 EUR)
• 3x Waschbeckenhandtücher (je 8 EUR)
• 3x Badvorleger (je 15 EUR)
• 2x Küchenhandtücher (je 5 EUR)

💶 KOSTEN:
Gesamt: 313 EUR

💡 HINWEIS:
Dies ist nur für diese Buchung berechnet.
Dein Safety Buffer im Inventar bleibt unberührt."
```

**Szenario B: Buffer-Abfrage**
```
User: "Wie ist der Buffer-Status für Wald Chalet?"

Assistent:
1. Ruft get_house_linen_status auf mit house_id
2. Prüft buffer_status im Response
3. Antwortet:

"🎯 Safety Buffer Status für Wald Chalet:

✅ Buffer ausreichend:
• Bettwäsche: 6 / 5 (+1 über Minimum)
• Große Handtücher: 7 / 5 (+2 über Minimum)

⚠️ Buffer knapp:
• Kleine Handtücher: 4 / 5 (-1 unter Minimum)

Empfehlung: 1x Kleine Handtücher nachbestellen."
```

---

## 7. AI Integration

### Wo wird AI verwendet?

**1. Prognosen (unverändert):**
- KI-Modell in `optimize-linen-inventory` berechnet weiterhin Forecasts
- Berücksichtigt Saisonalität, Gastverhalten, Wetterdaten
- **Neu:** Safety Buffer wird NICHT mehr in Bestellung eingerechnet

**2. Insights (erweitert):**
```json
{
  "ai_insights": [
    "📊 Basierend auf 15 historischen Buchungen",
    "🎯 Confidence: 87% (sehr hoch)",
    "🌡️ Saisonaler Faktor: 1.15 (Herbst)",
    "👥 Gasttyp-Anpassung: 1.05 (Deutsche Gäste)",
    "⚠️ HINWEIS: Safety Buffer separat verwalten"
  ]
}
```

**3. Buchungsbestellungen (NEU - ohne AI):**
- Einfache Formel: `(guests × per_guest) + per_booking`
- **Keine** AI-Prognose
- **Keine** Safety Buffer-Berechnung
- Nur exakte Mengen für diese Buchung

---

## 8. Chat-Assistent Tools

### Tool 1: `generate_booking_linen_order`

**Definition:**
```json
{
  "name": "generate_booking_linen_order",
  "description": "Erstellt Wäschebestellung für eine EINZELNE Buchung (ohne Safety Buffer)",
  "parameters": {
    "type": "object",
    "properties": {
      "booking_id": { 
        "type": "string", 
        "description": "UUID der Buchung" 
      }
    },
    "required": ["booking_id"]
  }
}
```

**Verwendung:**
```
User: "Was brauche ich für Dr. Mirtschink?"

Assistent:
1. search_bookings(guest_name: "Mirtschink") → booking_id
2. generate_booking_linen_order(booking_id) → order_items
3. Formatierte Antwort mit Mengen + Kosten
```

---

### Tool 2: `get_house_linen_status` (erweitert)

**Neu:** Enthält jetzt `buffer_status`

**Response-Struktur:**
```json
{
  "success": true,
  "house": { "id": "...", "name": "Wald Chalet" },
  "current_stock": { ... },
  "recommended_stock": { ... },
  "buffer_status": {
    "needs_refill": true,
    "deficit": {
      "bedding": {
        "current_buffer": 3,
        "min_buffer": 5,
        "refill_quantity": 2
      }
    },
    "status": "critical"
  }
}
```

---

## 9. Preisberechnung & Kosten

### Preisquelle

**Tabelle:** `ai_linen_settings.prices`

**Default-Werte:**
```json
{
  "bedding": 30,
  "large_towels": 18,
  "small_towels": 10,
  "sauna_towels": 20,
  "bath_mats": 15,
  "sink_towels": 8,
  "kitchen_towels": 5
}
```

### Kostenberechnung

```typescript
function calculateCost(orderItems, prices) {
  let totalCost = 0;
  const itemDetails = [];

  Object.entries(orderItems).forEach(([item, quantity]) => {
    const unitPrice = prices[item] || 0;
    const itemTotal = quantity * unitPrice;
    totalCost += itemTotal;
    
    itemDetails.push({
      item,
      quantity,
      unit_price: unitPrice,
      total_price: itemTotal
    });
  });

  return {
    total_cost: Math.round(totalCost * 100) / 100, // 2 Dezimalstellen
    item_details: itemDetails,
    currency: 'EUR'
  };
}
```

**Beispiel:**
```
5x Bettwäsche    (5 × 30 EUR) = 150 EUR
5x Große Handtücher (5 × 18 EUR) = 90 EUR
5x Kleine Handtücher (5 × 10 EUR) = 50 EUR
5x Saunahandtücher (5 × 20 EUR) = 100 EUR
3x Waschbeckenhandtücher (3 × 8 EUR) = 24 EUR
3x Badvorleger (3 × 15 EUR) = 45 EUR
2x Küchenhandtücher (2 × 5 EUR) = 10 EUR
─────────────────────────────────────
Gesamt: 469 EUR
```

---

## 10. Error Handling

### Szenario 1: Keine Linen-Set-Definition

**Edge Function Error:**
```json
{
  "success": false,
  "error": "Keine Wäsche-Definitionen für dieses Haus gefunden. Bitte legen Sie zuerst Wäsche-Regeln an."
}
```

**User-Feedback (Toast):**
```
❌ Fehler
Keine Wäsche-Regeln für dieses Haus hinterlegt.
Bitte gehen Sie zu Häuser → Wäsche-Definitionen.
```

---

### Szenario 2: Buchung nicht gefunden

**Edge Function Error:**
```json
{
  "success": false,
  "error": "Buchung nicht gefunden"
}
```

---

### Szenario 3: Keine Preise hinterlegt

**Fallback:** Verwendet Default-Preise (siehe oben)

**Logging:**
```
⚠️ No AI settings found for house, using default prices
```

---

## 11. Zukünftige Erweiterungen

### Phase 2: Automatische Buffer-Auffüllung

**Idee:** Wöchentlicher Cronjob prüft Buffer-Status und erstellt automatisch Nachbestellungen.

```sql
-- Beispiel: Cronjob
SELECT cron.schedule(
  'weekly-buffer-check',
  '0 8 * * 1', -- Jeden Montag 8 Uhr
  $$
    SELECT net.http_post(
      url:='https://[project].supabase.co/functions/v1/check-buffer-refill',
      headers:='{"Authorization": "Bearer [key]"}'::jsonb
    );
  $$
);
```

---

### Phase 3: Wäsche-Tracking

**Idee:** Tracke Wäsche durch alle Zustände:
- `available` → `in_use` → `dirty` → `in_cleaning` → `available`

**Neue Tabelle:**
```sql
CREATE TABLE linen_tracking (
  id UUID PRIMARY KEY,
  house_id UUID,
  item_type TEXT,
  item_id TEXT, -- z.B. QR-Code
  current_status TEXT,
  last_used_booking_id UUID,
  cleaning_cycles INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

---

### Phase 4: Lieferanten-Integration

**Idee:** API-Integration mit Wäscherei

```typescript
// Bestellung direkt an Wäscherei senden
async function sendOrderToLaundry(order) {
  await fetch('https://waescherei-api.de/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: 'steinbock-chalets',
      items: order.order_items,
      delivery_date: order.delivery_date,
      address: order.house.address
    })
  });
}
```

---

## 12. Technische Implementierung

### Dateistruktur

```
supabase/
├── functions/
│   ├── generate-booking-linen-order/  ← NEU
│   │   └── index.ts
│   ├── optimize-linen-inventory/       ← GEÄNDERT
│   │   └── index.ts                    (Buffer-Status hinzugefügt)
│   └── chat-assistant/                 ← GEÄNDERT
│       └── index.ts                    (Neues Tool)
└── migrations/
    └── [timestamp]_create_buffer_settings.sql  ← NEU

src/
├── components/
│   ├── Bookings/
│   │   └── CreateBookingForm.tsx       ← GEÄNDERT (Button)
│   └── Houses/
│       └── SmartLinenDashboard.tsx    ← GEÄNDERT (Buffer-Tab)
└── hooks/
    └── useLinenAI.ts                   ← UNVERÄNDERT
```

---

### Code-Änderungen Übersicht

**1. Neue Edge Function:**
- `generate-booking-linen-order/index.ts` (178 Zeilen)

**2. Modifizierte Edge Functions:**
- `optimize-linen-inventory/index.ts`:
  - Zeile 266: Safety Buffer entfernt
  - Zeile 415-470: `checkBufferStatus` hinzugefügt
  - Zeile 183: `buffer_status` in Response

- `chat-assistant/index.ts`:
  - Zeile 451-470: Neues Tool `generate_booking_linen_order`
  - Zeile 1092-1110: `executeGenerateBookingLinenOrder`
  - Zeile 1167: Tool-Router erweitert
  - Zeile 226-260: System-Prompt erweitert

**3. UI-Komponenten:**
- `CreateBookingForm.tsx`:
  - Zeile 7: Imports erweitert (`ShoppingCart`, `useMutation`)
  - Zeile 137-138: State für Dialog
  - Zeile 401-432: Mutation + Handler
  - Zeile 779-802: Button im Form

- `SmartLinenDashboard.tsx`:
  - Zeile 1-31: Imports erweitert (`Target`, `CheckCircle`, etc.)
  - Zeile 105-122: Helper-Funktionen
  - (Neuer Tab wird in Phase 2 hinzugefügt)

---

## 13. Validierungs-Checkliste

### Funktionale Tests

- [ ] **Buchung erstellen** → Button "Wäschebestellung" sichtbar im Edit-Mode
- [ ] **Wäschebestellung generieren** → Berechnung korrekt (5 Gäste = 28 Teile)
- [ ] **Kosten angezeigt** → 518 EUR für Dr. Mirtschink-Bestellung
- [ ] **Toast-Notification** → Erfolgsmeldung nach Berechnung
- [ ] **Buffer-Status** → Dashboard zeigt "Buffer ausreichend" oder "kritisch"
- [ ] **Chat-Assistent** → "Was brauche ich für [Gast]?" funktioniert
- [ ] **Chat-Assistent** → "Wie ist der Buffer?" zeigt Buffer-Status
- [ ] **Keine Safety Buffer** → Bestellmenge = exakte Buchungsmenge
- [ ] **Error Handling** → Toast bei fehlenden Wäsche-Regeln

### Datenbank-Tests

- [ ] **Migration erfolgreich** → Tabelle `buffer_settings` existiert
- [ ] **Default-Werte** → Buffer-Settings haben Defaults (5, 5, 5, ...)
- [ ] **Foreign Keys** → `house_id` referenziert `houses(id)`
- [ ] **Trigger** → `updated_at` wird automatisch aktualisiert

### Edge Function Tests

- [ ] **generate-booking-linen-order** → Läuft ohne Fehler
- [ ] **optimize-linen-inventory** → Gibt `buffer_status` zurück
- [ ] **chat-assistant** → Neues Tool funktioniert
- [ ] **Logging** → Logs zeigen korrekte Ablaufschritte

---

## 📝 Zusammenfassung

**Was hat sich geändert?**
1. ✅ Neue Edge Function `generate-booking-linen-order` für buchungsbezogene Bestellungen
2. ✅ Safety Buffer aus Bestellungen entfernt (nur im Inventar)
3. ✅ Buffer-Status-Überwachung in `optimize-linen-inventory` hinzugefügt
4. ✅ UI-Button in Buchungsformular für Wäschebestellung
5. ✅ Chat-Assistent mit neuem Tool `generate_booking_linen_order`
6. ✅ Dokumentation (diese Datei)

**Was bleibt gleich?**
- KI-Optimierung für Forecasts & Insights
- Linen-Set-Definitionen
- Preisberechnung
- Datenbankstruktur (außer neue Tabelle `buffer_settings`)

**Nächste Schritte:**
1. Buffer-Status Tab in SmartLinenDashboard UI implementieren
2. Buffer-Auffüllungs-Dialog implementieren
3. Tests durchführen (siehe Checkliste)
4. Produktions-Deployment

---

**Fragen oder Änderungen?** Kontaktiere das Entwicklungsteam oder erstelle ein Issue im Repository.

# Wäsche-Management System - Konzept

## Übersicht

Das Wäsche-Management System ist ein intelligentes System zur Verwaltung von Bettwäsche, Handtüchern und anderen Textilien in Ferienhäusern. Es automatisiert die Bedarfsberechnung, Bestandsverfolgung und Nachbestellung basierend auf anstehenden Buchungen.

## Kernfunktionen

### 1. Bedarfsanalyse (Demand Analysis)

#### Funktionsweise:
- **Automatische Berechnung**: System berechnet automatisch den Wäschebedarf basierend auf:
  - Anzahl der Gäste pro Buchung
  - Aufenthaltsdauer
  - Vordefinierte Wäsche-Sets pro Gast/Buchung
  - Einstellbare Vorausschau (14-90 Tage)

#### Wäsche-Kategorien:
- **Pro Gast**: Bettwäsche, Handtücher groß/klein, Saunatücher, Decken, Kissenbezüge
- **Pro Buchung**: Badematten, Waschbecken-Handtücher, Küchentücher

#### Status-Indikatoren:
- 🟢 **Ausreichend**: Bestand deckt Bedarf zu >100%
- 🟡 **Niedrig**: Bestand deckt 80-100% des Bedarfs
- 🔴 **Kritisch**: Bestand reicht nicht aus (Fehlmenge wird berechnet)

### 2. Intelligente Bestandsverfolgung

#### Mehrschichtige Bestandsführung:
```
Gesamtbestand = Physischer Bestand + Bestellte Ware - Reservierte Ware
```

#### Bestandskategorien:
- **linen_stock**: Verfügbarer sauberer Bestand
- **linen_dirty**: Schmutzige Wäsche zur Reinigung
- **linen_in_cleaning**: Aktuell in der Wäscherei
- **linen_reserved**: Für kommende Buchungen reserviert
- **linen_in_use**: Aktuell in den Häusern im Einsatz
- **ordered_linen**: Bestellte aber noch nicht gelieferte Ware

### 3. Automatische Nachbestellung

#### Bestelllogik:
- **Kritische Bestände**: Automatische Bestellvorschläge bei Fehlmengen
- **Vorsorgliche Bestellungen**: Bei niedrigen Beständen vor großen Buchungen
- **Pufferbestellungen**: Basierend auf historischen Verbrauchsdaten

#### Bestellprozess:
1. **Analyse**: System identifiziert Fehlmengen
2. **Vorschlag**: Automatische Bestellvorschläge mit anpassbaren Mengen
3. **Genehmigung**: Manuelle Freigabe oder automatische Bestellung
4. **Versand**: Integration mit Teuni Portal oder E-Mail-Versand
5. **Tracking**: Verfolgung von Bestellstatus und Lieferterminen

### 4. Integration mit Teuni Portal

#### Funktionen:
- **Automatischer Versand**: Bestellungen werden direkt an Teuni Portal übertragen
- **Statusverfolgung**: Rückmeldung über Bestellstatus und Liefertermine
- **Preismanagement**: Automatische Preisberechnung basierend auf Vereinbarungen
- **Qualitätskontrolle**: Bewertungssystem für gelieferte Ware

#### API-Integration:
```typescript
// Beispiel API-Aufruf
const sendOrderToTeuni = async (orderData) => {
  const response = await fetch('/api/teuni/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      houseId: orderData.houseId,
      items: orderData.items,
      deliveryDate: orderData.deliveryDate,
      priority: orderData.priority
    })
  });
  return response.json();
};
```

## Datenbankstruktur

### Zentrale Tabellen:

#### houses
```sql
- linen_stock: jsonb           -- Aktueller Bestand
- linen_dirty: jsonb           -- Schmutzige Wäsche  
- linen_in_cleaning: jsonb     -- In Reinigung
- linen_reserved: jsonb        -- Reserviert
- linen_in_use: jsonb          -- Im Einsatz
- ordered_linen: jsonb         -- Bestellt
```

#### linen_set_definitions
```sql
- house_id: uuid
- bedding_per_guest: integer           -- Bettwäsche pro Gast
- large_towels_per_guest: integer      -- Große Handtücher pro Gast
- small_towels_per_guest: integer      -- Kleine Handtücher pro Gast
- sauna_towels_per_guest: integer      -- Saunatücher pro Gast
- bath_mats_per_booking: integer       -- Badematten pro Buchung
- sink_towels_per_booking: integer     -- Waschbecken-Handtücher pro Buchung
- kitchen_towels_per_booking: integer  -- Küchentücher pro Buchung
- blankets_per_guest: integer          -- Decken pro Gast
- pillow_cases_per_guest: integer      -- Kissenbezüge pro Gast
```

#### linen_orders
```sql
- house_id: uuid
- provider_id: uuid
- items: jsonb                 -- Bestellte Artikel
- total_items: integer         -- Gesamtanzahl
- status: text                 -- pending, confirmed, delivered
- order_date: date
- delivery_date: date
- email_sent_at: timestamp     -- Wann E-Mail gesendet
- notes: text
```

#### linen_transactions
```sql
- house_id: uuid
- booking_id: uuid
- transaction_type: text       -- in, out, cleaning, order
- linen_items: jsonb          -- Bewegte Artikel
- previous_stock: jsonb       -- Bestand vorher
- new_stock: jsonb           -- Bestand nachher
- notes: text
```

## Benutzeroberfläche

### 1. Übersichtsdashboard
- **Haus-Karten**: Kompakte Ansicht aller Häuser mit Wäschestatus
- **Status-Ampeln**: Sofortige Erkennung kritischer Bestände
- **Aktionsbuttons**: Schnelle Bestellung oder Bearbeitung

### 2. Detailansicht pro Haus
```
┌─ Tabs ─────────────────────────────────────────┐
│ Inventar | Wäsche-Regeln | Bestellungen        │
├────────────────────────────────────────────────┤
│ [Bedarfsanalyse]                               │
│ ┌─ Bettwäsche ──── Ausreichend ── 6/5 ────┐    │
│ │ Bestand: 6    Bedarf: 5    Verfügbar: 1  │    │
│ │ ████████████████████████░░ 100%          │    │
│ └──────────────────────────────────────────┘    │
│ ┌─ Saunatücher ──── Kritisch ──── 0/5 ────┐    │
│ │ Bestand: 0    Bedarf: 5    Fehlend: 5    │    │
│ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%            │    │
│ └──────────────────────────────────────────┘    │
└────────────────────────────────────────────────┘
```

### 3. Buchungsübersicht
- **Chronologische Liste**: Kommende Buchungen mit Wäschebedarf
- **Selektive Analyse**: Auswahl spezifischer Buchungen für Bedarfsberechnung
- **Gästedetails**: Anzahl Gäste, Aufenthaltsdauer, berechneter Bedarf

### 4. Bestellverwaltung
- **Aktive Bestellungen**: Status und Liefertermine
- **Bestellhistorie**: Vergangene Bestellungen mit Bewertungen
- **Schnellbestellung**: Ein-Klick-Bestellung für kritische Artikel

## Automatisierung und Workflows

### 1. Tägliche Routinen
- **Bestandsabgleich**: Automatische Synchronisation aller Bestände
- **Bedarfsprognose**: Aktualisierung basierend auf neuen Buchungen
- **Kritische Bestände**: E-Mail-Benachrichtigungen an Hausverwalter

### 2. Buchungsbasierte Trigger
- **Neue Buchung**: Automatische Bedarfsberechnung und Reservierung
- **Stornierung**: Freigabe reservierter Wäsche
- **Check-out**: Verschiebung von "in_use" zu "dirty"

### 3. Lieferanten-Integration
- **Bestellübertragung**: Automatische Übermittlung an Teuni Portal
- **Statusupdates**: Rückmeldung über Bestellfortschritt
- **Lieferbestätigung**: Automatische Bestandsaktualisierung

## Reporting und Analytics

### 1. Verbrauchsanalyse
- **Trends**: Saisonale Verbrauchsmuster
- **Effizienz**: Auslastung der Wäschebestände
- **Kosten**: Analyse der Bestellkosten pro Haus

### 2. Performance Metriken
- **Bestandsreichweite**: Durchschnittliche Tage bis zur nächsten Bestellung
- **Fehlmengen**: Häufigkeit kritischer Bestände
- **Lieferzeiten**: Durchschnittliche Lieferzeiten der Partner

### 3. Optimierungsvorschläge
- **Bestandsoptimierung**: Empfohlene Mindestbestände
- **Bestellrhythmus**: Optimale Bestellintervalle
- **Kostenreduzierung**: Vorschläge zur Kostensenkung

## Technische Implementierung

### Frontend (React/TypeScript)
```typescript
// Hooks für Wäsche-Management
const useLinenManagement = (houseId: string) => {
  const { data: analysis } = useLinenDemandAnalysis(houseId);
  const { mutate: createOrder } = useCreateLinenOrder();
  const { mutate: sendToTeuni } = useSendToTeuniPortal();
  
  return { analysis, createOrder, sendToTeuni };
};
```

### Backend (Supabase Edge Functions)
```typescript
// Automatische Bedarfsberechnung
export const calculateLinenDemand = async (houseId: string, days: number) => {
  const bookings = await getUpcomingBookings(houseId, days);
  const definitions = await getLinenDefinitions(houseId);
  const currentStock = await getCurrentStock(houseId);
  
  return analyzeLinenDemand(bookings, definitions, currentStock);
};
```

### Externe Integrationen
- **Teuni Portal API**: RESTful API für Bestellübertragung
- **E-Mail Service**: Automatische Benachrichtigungen
- **Kalender Integration**: iCal Synchronisation für Buchungen

## Sicherheit und Datenschutz

### 1. Zugriffskontrolle
- **Rollenbasierte Berechtigungen**: Admin, Hausverwalter, Nur-Lesen
- **Haus-spezifische Rechte**: Zugriff nur auf zugewiesene Häuser
- **Audit Trail**: Protokollierung aller Änderungen

### 2. Datenintegrität
- **Transaktionale Updates**: Atomare Bestandsänderungen
- **Validierung**: Plausibilitätsprüfungen bei Eingaben
- **Backup**: Regelmäßige Sicherung aller Daten

## Erweiterungen und Roadmap

### Phase 1 (Aktuell)
- ✅ Grundlegende Bedarfsanalyse
- ✅ Bestandsverfolgung
- ✅ Manuelle Bestellerstellung
- ✅ E-Mail Integration

### Phase 2 (Geplant)
- 🔄 Teuni Portal Integration
- 🔄 Automatische Bestellungen
- 🔄 Mobile App
- 🔄 Barcode Scanning

### Phase 3 (Zukunft)
- 📋 KI-basierte Bedarfsprognose
- 📋 IoT Sensoren für Bestandserfassung
- 📋 Qualitätsmanagement
- 📋 Lieferanten-Marktplatz

## Fazit

Das Wäsche-Management System bietet eine vollständige Lösung für die automatisierte Verwaltung von Textilien in Ferienhäusern. Durch intelligente Bedarfsberechnung, proaktive Bestellvorschläge und nahtlose Integration mit Lieferanten wird der Verwaltungsaufwand minimiert und die Gästezufriedenheit maximiert.
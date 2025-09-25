# Wäsche-Inventar Management System - Lösungskonzept

## Überblick
Vollständiges Inventar-Management System für Ferienhäuser mit intelligenter Bedarfsanalyse, kritischer Bestandsüberwachung und automatischer Bestellfunktion.

## Hauptkomponenten

### 1. Inventar Dashboard
**Ziel**: Zentrale Übersicht aller Wäschekategorien mit Bestand vs. Bedarf

#### Features:
- **Haus-spezifische Ansicht** mit Adresse und Aktionsbuttons (Bestellen/Bearbeiten)
- **Kategorien-Grid** mit folgenden Wäschetypen:
  - Bettwäsche
  - Decken  
  - Badematten
  - Handtücher (Waschbecken, groß, klein)
  - Kissenbezüge
  - Saunatücher
  - Küchentücher

#### Für jede Kategorie:
- **Aktueller Bestand** (verfügbare Menge)
- **Berechneter Bedarf** (basierend auf Buchungen)
- **Status-Indikator**:
  - 🟢 **Ausreichend**: Bestand >= Bedarf
  - 🟡 **Niedrig**: Bestand 70-99% vom Bedarf  
  - 🔴 **Kritisch**: Bestand < Bedarf
- **Fehlmenge** ("5 fehlen" bei kritischem Status)
- **Verfügbarkeits-Prozent** (0% bis 100% verfügbar)
- **Fortschrittsbalken** mit Farbkodierung

### 2. Anstehende Buchungen Integration
**Ziel**: Dynamische Bedarfsberechnung basierend auf konkreten Buchungen

#### Features:
- **Buchungsliste** mit Checkbox-Auswahl
- **Buchungsdetails**:
  - Gast-Name
  - Check-in/Check-out Datum
  - Anzahl Tage
  - Anzahl Gäste  
  - Anzahl Bäder
  - **Berechnete Wäscheteile** pro Buchung
- **Selektive Bedarfsanalyse**: Nur ausgewählte Buchungen berücksichtigen
- **Automatische Sortierung** nach Check-in Datum

### 3. Intelligente Bedarfsberechnung
**Algorithmus für jeden Wäschetyp**:

```
Bedarf = (Gäste × Pro-Gast-Faktor) + (Buchungen × Pro-Buchung-Faktor)

Beispiele:
- Bettwäsche: 5 Gäste × 1 = 5 Stück
- Badematten: 1 Buchung × 3 = 3 Stück  
- Saunatücher: 5 Gäste × 1 = 5 Stück
- Küchentücher: 1 Buchung × 2 = 2 Stück
```

#### Berücksichtigung:
- **Wäscheset-Definitionen** pro Haus
- **Überlappende Buchungen** (Pufferzeit)
- **Reinigungszyklen** zwischen Buchungen
- **Sicherheitspuffer** für unvorhergesehene Ereignisse

### 4. Bestell-Management
**Ziel**: Automatische und manuelle Bestellabwicklung

#### Automatische Bestellung:
- **Kritische Items** automatisch identifizieren
- **Fehlmengen** berechnen und bestellen
- **Provider-Integration** (Teuni Portal/Email)
- **Liefertermin-Optimierung** basierend auf Check-in Daten

#### Manuelle Bestellung:
- **Bearbeiten-Modus** für Bestands-Anpassungen
- **Custom Mengen** definieren
- **Spezielle Anforderungen** hinzufügen

### 5. Status-System
#### Bestandsstatus:
- **🟢 Ausreichend**: `Bestand >= Bedarf`
- **🟡 Niedrig**: `Bedarf × 0.7 <= Bestand < Bedarf`  
- **🔴 Kritisch**: `Bestand < Bedarf × 0.7`

#### Verfügbarkeits-Berechnung:
```
Verfügbarkeit% = (Aktueller Bestand / Gesamtbedarf) × 100
```

### 6. Tab-Navigation
#### Inventar Tab (Hauptansicht):
- Bestandsübersicht aller Kategorien
- Kritische Items hervorheben
- Schnelle Bestell-Aktionen

#### Wäscheset-Regeln Tab:
- Definition Pro-Gast/Pro-Buchung Faktoren
- Haus-spezifische Konfiguration
- Kategorie-Management

#### Bestellungen Tab:
- Aktive Bestellungen anzeigen
- Bestell-Historie
- Lieferstatus verfolgen

## Technische Implementierung

### Datenbank-Schema:
```sql
-- Erweitert houses Tabelle
linen_stock: jsonb          -- Aktueller Bestand
ordered_linen: jsonb        -- Bestellte Mengen
linen_in_use: jsonb        -- In Verwendung
linen_dirty: jsonb         -- Schmutzwäsche
linen_in_cleaning: jsonb   -- In Reinigung
linen_reserved: jsonb      -- Reserviert für Buchungen

-- linen_set_definitions
bedding_per_guest: integer
large_towels_per_guest: integer
...
bath_mats_per_booking: integer
kitchen_towels_per_booking: integer
```

### API-Endpunkte:
- `GET /linen-analysis/{house_id}` - Bedarfsanalyse
- `POST /linen-orders` - Neue Bestellung erstellen
- `PUT /linen-stock/{house_id}` - Bestand aktualisieren
- `GET /upcoming-bookings/{house_id}` - Anstehende Buchungen

### UI-Komponenten:
- `LinenInventoryDashboard` - Hauptübersicht
- `LinenCategoryCard` - Einzelne Kategorie mit Status
- `BookingSelector` - Buchungsauswahl Interface
- `OrderManager` - Bestell-Interface
- `StockEditor` - Bestandseditor

## Benutzer-Workflow

### 1. Übersicht öffnen
- Admin wählt "Wäsche" Tab in Navigation
- System lädt aktuelles Inventar für alle Häuser
- Kritische Bestände werden hervorgehoben

### 2. Haus-spezifische Analyse
- Klick auf ein Haus öffnet detaillierte Inventar-Ansicht
- System berechnet Bedarf basierend auf kommenden Buchungen
- Status-Indikatoren zeigen kritische/ausreichende Kategorien

### 3. Buchungen berücksichtigen
- User kann spezifische Buchungen auswählen
- Bedarfsberechnung passt sich dynamisch an
- Realistische Planung für gewählten Zeitraum

### 4. Automatische Bestellung
- Bei kritischen Beständen: "Bestellen" Button
- System erstellt automatisch Bestellung für fehlende Items
- Versand an Teuni Portal oder Email-Provider

### 5. Manuelle Anpassungen
- "Bearbeiten" Button für Bestands-Korrekturen
- Custom Mengen für spezielle Anforderungen
- Notizen und besondere Anweisungen

## Vorteile des Systems

### Für Vermieter:
- **Transparenz**: Immer aktueller Überblick über Wäschebestände
- **Automatisierung**: Reduziert manuellen Planungsaufwand
- **Kostenoptimierung**: Vermeidet Über-/Unterbestellungen
- **Zeitersparnis**: Schnelle Identifikation kritischer Bestände

### Für Gäste:
- **Qualitätssicherung**: Immer ausreichend saubere Wäsche
- **Verlässlichkeit**: Keine Engpässe bei Ankunft

### Für Service-Provider:
- **Planungssicherheit**: Rechtzeitige Bestellbenachrichtigungen
- **Integration**: Direkte Schnittstelle zu Teuni Portal
- **Nachverfolgung**: Status-Updates für alle Bestellungen

## Metriken & KPIs
- **Bestandsgenauigkeit**: Soll vs. Ist Vergleich
- **Kritische Ereignisse**: Anzahl kritischer Bestände pro Monat
- **Automatisierungsgrad**: % automatisch erstellte Bestellungen
- **Lieferzeit-Optimierung**: Durchschnittliche Zeit bis Lieferung
- **Kosten-Tracking**: Wäsche-Ausgaben pro Haus/Buchung
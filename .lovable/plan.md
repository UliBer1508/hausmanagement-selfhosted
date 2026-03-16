

# Automatische Rechnungs-Erstellung bei Wäschebestellungen

## Übersicht
Wenn eine Wäschebestellung erstellt wird, soll automatisch ein Rechnungs-Platzhalter in `laundry_invoices` angelegt werden. Die Rechnung enthält zunächst nur die Bestelldaten (Haus, Datum, Positionen). Sobald die echte Rechnung von Teuni kommt, füllt der Nutzer Rechnungsnummer, Beträge und Zahlungsdatum aus.

## Datenbank-Änderungen

### 1. Neue Spalte `linen_order_id` in `laundry_invoices`
- `linen_order_id UUID REFERENCES linen_orders(id)` (nullable, unique)
- Verknüpft eine Rechnung eindeutig mit einer Wäschebestellung

### 2. Datenbank-Trigger auf `linen_orders` INSERT
Ein `AFTER INSERT` Trigger auf `linen_orders` erstellt automatisch einen Rechnungs-Platzhalter:
- `external_rechnung_id`: generierte UUID (Pflichtfeld)
- `rechnungsnummer`: `'ENTWURF-' || LEFT(NEW.id::text, 8)` 
- `rechnungsdatum`: `NEW.order_date`
- `bruttobetrag`: `0` (wird später ausgefüllt)
- `status`: `'offen'`
- `linen_order_id`: `NEW.id`
- `notes`: Haus-Name und Buchungsinfo als Referenz

## Frontend-Änderungen

### 3. Rechnungsliste anpassen (`LaundryInvoicesList.tsx`)
- Entwurf-Rechnungen visuell kennzeichnen (z.B. Badge "📝 Entwurf" wenn `bruttobetrag = 0` und `rechnungsnummer` mit "ENTWURF" beginnt)
- Bearbeitungs-Button prominenter machen für Entwürfe

### 4. Rechnungs-Bearbeitung erweitern
- Bestehenden `InvoiceDetailsDialog` um Bearbeitungsmodus erweitern oder einen Edit-Dialog erstellen
- Felder: Rechnungsnummer, Rechnungsdatum, Nettobetrag, MwSt, Bruttobetrag, Fälligkeitsdatum
- Beim Speichern werden die Platzhalter-Werte mit den echten Rechnungsdaten überschrieben

### 5. Wäsche-Spalte in Buchungsübersicht
- Optional: Link von der Wäsche-Bestellung zur zugehörigen Rechnung

## Technischer Ablauf
```text
Wäschebestellung erstellt (egal wo: UI, Automation, Edge Function)
        │
        ▼
DB Trigger: AFTER INSERT ON linen_orders
        │
        ▼
INSERT INTO laundry_invoices (Platzhalter mit bruttobetrag=0)
        │
        ▼
Nutzer sieht "ENTWURF" Rechnung in der Rechnungsliste
        │
        ▼
Teuni schickt echte Rechnung → Nutzer füllt Daten aus
```


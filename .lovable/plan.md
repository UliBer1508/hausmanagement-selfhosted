

# Klarstellung: Wir verwenden die bestehende `laundry_invoices` Tabelle

Du hast recht – es wird **keine neue Tabelle** erstellt. Der Plan nutzt die **bestehende `laundry_invoices` Tabelle** (die auch im "Rechnungen"-Tab der Abrechnung-Teuni-Dialog angezeigt wird).

## Was passiert konkret

### 1. Kleine Erweiterung der bestehenden Tabelle
- Neue Spalte `linen_order_id` (UUID, nullable, unique) wird zur **bestehenden** `laundry_invoices` Tabelle hinzugefügt
- Damit wird jede Rechnung mit ihrer Wäschebestellung verknüpft

### 2. Datenbank-Trigger
- Wenn eine Wäschebestellung (`linen_orders`) erstellt wird, wird automatisch ein Platzhalter-Eintrag in `laundry_invoices` eingefügt
- Status `offen`, Bruttobetrag `0`, Rechnungsnummer `ENTWURF-...`
- Dieser erscheint dann direkt im bestehenden "Rechnungen"-Tab

### 3. Frontend: Edit-Funktion für Entwürfe
- Entwurfs-Rechnungen visuell kennzeichnen (Badge "📝 Entwurf")
- Edit-Dialog zum Ausfüllen der echten Rechnungsdaten (Nummer, Beträge, Datum) wenn die Teuni-Rechnung kommt

### Ablauf
```text
Wäschebestellung erstellt
        │
        ▼
Trigger: Platzhalter in laundry_invoices (bestehende Tabelle!)
        │
        ▼
Erscheint im "Rechnungen"-Tab als Entwurf
        │
        ▼
Teuni-Rechnung kommt → Nutzer füllt echte Daten aus
```

**Änderungen in 2 Dateien:**
- **Migration:** ALTER TABLE `laundry_invoices` ADD COLUMN + Trigger-Funktion
- **`LaundryInvoicesList.tsx`:** Entwurf-Badge + Edit-Dialog für Rechnungsdaten


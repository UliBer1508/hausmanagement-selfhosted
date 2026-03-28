

# Buchungs-Widgets umstrukturieren

## Aktuell (4 Widgets)
1. Buchungen gesamt
2. Bestätigt
3. Abgeschlossen
4. Gesamtumsatz (mit Gezahlt/Offen)

## Neu (4 Widgets)

### Widget 1: Buchungsübersicht (3 Zähler kombiniert)
```text
┌────────────────────────────────┐
│ 📊 Buchungen 2026              │
│ 32 Gesamt                      │
│ 11 Bestätigt · 16 Abgeschlossen│
└────────────────────────────────┘
```

### Widget 2: Reinigungskosten
Summe `cleaning_cost` aus `service_tasks` (gefiltert nach `scheduled_date` im gewählten Jahr, `service_type = 'cleaning'`).
```text
┌────────────────────────────────┐
│ 🧹 Reinigungskosten 2026       │
│ 3.450 EUR                      │
│ ✅ Bezahlt: 2.100 EUR          │
│ ⚠️ Offen:  1.350 EUR           │
└────────────────────────────────┘
```
Bezahlt/Offen über `payment_status` in `service_tasks`.

### Widget 3: Wäschekosten
Summe `bruttobetrag` aus `laundry_invoices` (gefiltert nach `rechnungsdatum` im gewählten Jahr).
```text
┌────────────────────────────────┐
│ 👕 Wäschekosten 2026            │
│ 5.230 EUR                      │
│ ✅ Bezahlt: 3.800 EUR          │
│ ⚠️ Offen:  1.430 EUR           │
└────────────────────────────────┘
```
Bezahlt/Offen über `status` der Rechnungen (`bezahlt` vs. Rest).

### Widget 4: Gesamtumsatz (bleibt exakt wie bisher)

## Technische Umsetzung

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

1. **Zwei neue Queries** hinzufügen (neben dem bestehenden `bookings-overview` Query):
   - `service_tasks` → `cleaning_cost`, `payment_status`, `scheduled_date`, `service_type`
   - `laundry_invoices` → `bruttobetrag`, `status`, `rechnungsdatum`

2. **`yearStats` erweitern** um berechnete Felder:
   - `cleaningCostsTotal` / `cleaningCostsPaid`
   - `laundryCostsTotal` / `laundryCostsPaid`

3. **Widget-Grid anpassen**: Erstes Widget zeigt alle 3 Zähler, Widgets 2+3 werden Reinigungs-/Wäschekosten, Widget 4 bleibt unverändert.

Keine neuen Dateien oder Migrationen nötig.


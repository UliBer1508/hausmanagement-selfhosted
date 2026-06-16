# Konzept: Kostenwahrheit Wäsche & Reinigung vs. Buchungseinnahmen

> **Zweck:** Reinigungs- und Wäschekosten den Buchungseinnahmen korrekt
> gegenüberstellen. Verifizierter Ist-Zustand (Code gelesen 16.06.2026) plus
> schrittweise Lösung. **Schritte 1, 2, 5(Teil) umgesetzt; Kalibrierung offen.**

---

## 1. Ist-Zustand (im Code verifiziert)

### Zwei verschiedene „Wäschekosten" — nicht verwechseln
| Größe | Quelle | Bedeutung |
|---|---|---|
| **Geschätzt** | `linen_orders.total_cost` | Stückzahl × Stückpreis (`ai_linen_settings.prices`) |
| **Ist** | `laundry_invoices.bruttobetrag` | echte Teuni-Rechnungen |

- `total_cost` existiert seit 16.06.2026 als DB-Spalte (numeric, nullable) und wird
  befüllt: Auto-Flow (`auto-create-linen-orders`), manueller Flow
  (`LinenOrderDialog` → `handleCreateOrUpdateOrder`), Backfill für Altbestände.
- **Wichtig:** Teuni-Rechnungen (`laundry_invoices`) haben KEIN `house_id` und sind
  daher NICHT pro Haus aufteilbar. Geschätzte Kosten (`linen_orders.total_cost`)
  haben über `house_id` eine saubere Hauszuordnung.

### Reinigungskosten
- `service_tasks.cleaning_cost`, hat `house_id` → pro Haus aufteilbar.
- Schätzung und Ist sind hier dieselbe Zahl (anders als bei Teuni).

### Verknüpfung Rechnung ↔ Bestellung
- `linen_orders.laundry_invoice_id` (manuell über `AssignOrdersToInvoiceDialog`).
- Mehrere Bestellungen je Rechnung möglich.

---

## 2. Das Problem (vom Nutzer beschrieben, im Code bestätigt)
1. Geschätzte Stückpreise sind ungenau (manuelle Eingabe).
2. Teuni ordnet Rechnungen nicht sauber pro Bestellung/Haus zu; nicht jedes Stück
   ist einzeln bepreist.
3. Folge: Jahres-Gesamtbetrag exakt, aber Aufteilung pro Buchung/Haus unsicher.

---

## 3. Leitidee: Schätzung und Ist sauber trennen, beides nebeneinander
- **Ebene A — Kalkulation:** `linen_orders.total_cost` (pro Haus/Buchung).
- **Ebene B — Ist:** `laundry_invoices.bruttobetrag` (Gesamtwahrheit).
- Nutzer-Entscheidung: beides NEBENEINANDER zeigen, nichts verstecken.

### Kalibrierung ist ein Zwei-Wege-Werkzeug
- **Mit Teuni-Preisliste:** echte Preise eingetragen → Ansicht als Rechnungs-
  Gegenprobe (Σ geschätzte Kosten der Bestellungen einer Rechnung ≈ Bruttobetrag?).
- **Ohne Preisliste:** aus Rechnungsbetrag ÷ Σ Stückzahl den realen Stückpreis
  ZURÜCKRECHNEN und als Eintragungs-Vorschlag anbieten.
- Vergleichsebene: pro RECHNUNG / Zeitraum (Variante 2), nicht pro Bestellung.

---

## 4. Lösungsschritte

### Schritt 1 — total_cost bei Bestellungen ✅ ERLEDIGT (16.06.2026)
- DB-Spalte `linen_orders.total_cost` (numeric, nullable) per Migration angelegt.
- `auto-create-linen-orders` schreibt `total_cost: orderData.estimated_cost ?? null`.
- Manueller Flow: `LinenOrderDialog` gibt `estimatedCost` an `onCreateOrder` mit;
  `handleCreateOrUpdateOrder` (OriginalDashboard) schreibt `total_cost` in Insert
  und Update.
- Karte liest `order.total_cost`, zeigt es bei > 0.
> Lektion: Karte las das Feld bereits, Spalte fehlte aber — Schema vorab prüfen.

### Schritt 2 — Altbestände nachziehen ✅ ERLEDIGT (16.06.2026)
- Einmalige Edge Function `backfill-linen-costs`, Filter `delivery_date >= '2026-01-01'`
  (NICHT `created_at` — Januar-Bestellungen werden oft im Dez 2025 angelegt).
- Ergebnis: 30 geprüft, 30 aktualisiert, 0 übersprungen. Gesamt geschätzt: 2.858,20 €.
- Function ist Einmal-Werkzeug, nach Lauf gelöscht/löschbar.
- Daten bereinigt: 3 providerlose touristische Bestellungen Teuni zugeordnet.

### Schritt 3 — Kalibrierungs-/Prüfansicht auf Rechnungsebene ⏳ OFFEN
Vergleichsebene pro Rechnung/Zeitraum. Grundlage vorhanden:
`linen_orders.laundry_invoice_id`, `total_items`, `total_cost`;
`laundry_invoices.bruttobetrag` (+ `positionen[]`). Zeigt je Rechnung:
Σ geschätzt, Σ Stückzahl, Bruttobetrag, Abweichung, zurückgerechneter Stückpreis.
Nur anzeigen + optionaler Übernahme-Vorschlag, kein Auto-Overwrite.
> Startet, sobald Teuni-Preislisten-Frage geklärt ist (Fall A vs. B).

### Schritt 4 — Ist-Kosten auf Bestellungen verteilen ⏳ OFFEN
Rechnungsbetrag anteilig auf zugeordnete Bestellungen verteilen (neues Feld
`actual_cost`). Verteil-Schlüssel offen: Stückzahl (robuster) vs. geschätzter Preis.

### Schritt 5 — Wirtschaftlichkeit je Haus ✅ TEIL-UMGESETZT (16.06.2026)
- Buchungsübersicht (`BookingOverviewFixed.tsx`) hat Haus-Umschalter
  (`cardHouseFilter`: Gesamt / Venediger / Wald) über den vier Kacheln.
- Kacheln pro Haus: Buchungen, Reinigung (bezahlt/offen), Wäsche (geschätzt),
  Umsatz (bezahlt/offen).
- Wäschekosten-Kachel nutzt in dieser Ansicht die GESCHÄTZTEN `total_cost` pro Haus
  (da Teuni-Rechnungen nicht pro Haus aufteilbar).
- Pro-Buchung-Deckungsbeitrag (Marge) bewusst NICHT eingebaut (Nutzer-Entscheidung).
> Offen für später: echte Ist-Wäschekosten pro Haus (erst möglich mit Schritt 3/4).

---

## 5. Datenmodell-Auswirkungen
| Bedarf | Feld | Status |
|---|---|---|
| Schätzkosten je Bestellung | `linen_orders.total_cost` | ✅ vorhanden + befüllt |
| Ist-Kosten je Bestellung | `linen_orders.actual_cost` | ⏳ neu (Schritt 4) |
| Rechnungszuordnung | `linen_orders.laundry_invoice_id` | ✅ vorhanden |
| Ist-Rechnung | `laundry_invoices.bruttobetrag` + `positionen[]` | ✅ vorhanden |
| Reinigungskosten | `service_tasks.cleaning_cost` (+ house_id) | ✅ vorhanden |
| Einnahmen | `bookings.booking_amount` (+ house_id) | ✅ vorhanden |

---

## 6. Getroffene Entscheidungen (Nutzer, 16.06.2026)
1. Schätzung UND Ist immer nebeneinander zeigen.
2. Vergleichsebene = pro Rechnung/Zeitraum (Variante 2).
3. Kalibrierung als Zwei-Wege-Werkzeug (Gegenprobe ODER Preis-Rückrechnung),
   kein Auto-Overwrite.
4. Pro-Haus-Auswertung nutzt geschätzte Wäschekosten (Teuni nicht pro Haus teilbar).
5. Keine Marge/Deckungsbeitrag-Zeile in der Kachel-Ansicht.

## 7. Noch offen
- Teuni-Preisliste anfragen → entscheidet Fall A (Gegenprobe) vs. B (Rückrechnung).
- Schritt 3 (Kalibrierungsansicht), danach Schritt 4 (actual_cost + Verteilung).
- Verteil-Schlüssel Schritt 4: Stückzahl vs. geschätzter Preis.

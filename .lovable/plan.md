

# Rechnung erstellen und Bestellungen zuordnen

## Konzept
Der User möchte zuerst eine Rechnung ausfüllen (Rechnungsnummer, Datum, Beträge) und dann in einem zweiten Schritt entscheiden, welche Bestellungen/Entwürfe diese Rechnung abdeckt. Das ist der umgekehrte Workflow zum aktuellen `MergeInvoicesDialog`.

## Änderungen

### 1. Neuer Dialog: `AssignOrdersToInvoiceDialog`
- **Schritt 1 (Rechnungsdaten)**: Formular mit Rechnungsnummer, Datum, Fälligkeit, Netto, MwSt, Brutto, Notizen (wie im bestehenden `CreateInvoiceDialog`)
- **Schritt 2 (Bestellungen zuordnen)**: Liste aller offenen Bestellungen (aus `linen_orders`) mit Checkboxen, Haus-Filter, Datum-Filter. Zeigt Lieferdatum, Haus, Gast, Artikel-Anzahl
- Navigation zwischen Schritten via "Weiter"/"Zurück" Buttons

### 2. Speicher-Logik
1. Neue `laundry_invoice` erstellen (status: offen, kunde_name: Teuni)
2. Ausgewählte `linen_orders` auf die neue `laundry_invoice_id` umlinken
3. Alte Draft-Invoices (ENTWURF-*) der umgelinkten Orders löschen (falls vorhanden)

Dazu wird ein neuer Mutation-Hook `useCreateInvoiceWithOrders` in `useLaundryInvoices.ts` erstellt.

### 3. Integration in TeuniOrdersOverview
- "Rechnung erstellen" Button (Zeile 309) öffnet den neuen Dialog
- Ausgewählte Order-IDs werden als `preselectedOrderIds` übergeben
- Nach Erfolg: Selection zurücksetzen, Queries invalidieren

### 4. Auch von Rechnungen-Tab erreichbar
- In `LaundryInvoicesList` einen Button "Neue Rechnung mit Zuordnung" hinzufügen, der denselben Dialog ohne Vorauswahl öffnet

### Technische Details
- Der Dialog nutzt `useState` für einen `step` (1=Formular, 2=Zuordnung)
- Bestellungen werden via `supabase.from('linen_orders').select('id, delivery_date, house_id, status, total_items, laundry_invoice_id, houses(name), bookings(guest_name, check_in)').eq('provider_id', TEUNI_ID)` geladen
- Nur Bestellungen ohne finale Rechnung (nur ENTWURF- oder ohne Invoice) werden angezeigt
- Filter: Haus-Dropdown und Datumsbereich (wie in TeuniOrdersOverview)


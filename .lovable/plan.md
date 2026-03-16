

# Filter- und Selektionsfunktion für TeuniOrdersOverview

## Änderungen in `src/components/ServicePortal/TeuniOrdersOverview.tsx`

### Neue Filter-Leiste oberhalb der Tabelle

Drei Filter nebeneinander zwischen den Summary Cards und der Tabelle:

```text
[🔍 Haus ▼]  [📅 Lieferdatum von-bis]  [Status ▼]  [Checkboxen in Tabelle]
```

1. **Haus-Filter**: Select-Dropdown mit allen einzigartigen Hausnamen aus den geladenen Bestellungen. Option "Alle Häuser" als Default.

2. **Datum-Filter**: Zwei Datepicker (Von/Bis) für den Lieferdatum-Bereich. Filtert `delivery_date` clientseitig.

3. **Status-Filter**: Select-Dropdown mit den Status-Werten (Offen, Ausstehend, Bestellt, Geliefert, Storniert). Option "Alle Status" als Default.

4. **Checkboxen**: Checkbox-Spalte in jeder Zeile + Select-All im Header. Aktionsleiste bei Auswahl mit Anzahl und "Rechnung erstellen" Button.

### Technische Details

- States: `houseFilter`, `statusFilter`, `dateFrom`, `dateTo`, `selectedOrderIds` (Set)
- Hausnamen werden per `useMemo` aus `linenOrders` extrahiert
- Gefilterte Liste per `useMemo` mit allen Filtern kombiniert
- Statistik-Cards zeigen weiterhin ungefilterte Gesamtwerte
- Imports: `Select`, `Input` (oder Datepicker), `Checkbox`, `useState`
- ColSpan der leeren Zeile wird auf 9 erhöht (neue Checkbox-Spalte)

### Layout
```text
┌──────────────┬──────────────────────┬──────────────┐
│ Haus: [Alle] │ Von: [__] Bis: [__]  │ Status:[Alle]│
└──────────────┴──────────────────────┴──────────────┘
┌─────────────────────────────────────────────────────┐
│ ☐ │ Lieferdatum │ Haus │ Gast │ ... │ Status │ ... │
│ ☑ │ 15.03.2026  │ Haus1│ ...  │ ... │ Offen  │ ... │
│ ☐ │ 12.03.2026  │ Haus2│ ...  │ ... │ ...    │ ... │
└─────────────────────────────────────────────────────┘
[ 2 ausgewählt ]                    [ Rechnung erstellen ]
```


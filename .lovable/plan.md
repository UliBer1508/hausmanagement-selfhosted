

# Suchleiste für Rechnungsliste

## Änderung

In `LaundryInvoicesList.tsx` eine Textsuche unterhalb des Headers/Buttons und oberhalb der Tabelle einfügen:

- Neuer State `searchQuery`
- Input-Feld mit Search-Icon und Placeholder "Rechnungsnummer suchen..."
- Client-seitige Filterung der `invoices`-Liste nach `rechnungsnummer` (case-insensitive `includes`)
- Gefilterte Liste wird in der Tabelle gerendert statt `invoices` direkt

### Konkrete Änderung
- Import `Search` Icon und `Input` Komponente
- State: `const [searchQuery, setSearchQuery] = useState('')`
- Filtered: `const filteredInvoices = invoices?.filter(inv => inv.rechnungsnummer?.toLowerCase().includes(searchQuery.toLowerCase()))`
- Zwischen `CardHeader` und Tabelle ein `Input` mit Search-Icon einfügen
- Tabelle rendert `filteredInvoices` statt `invoices`


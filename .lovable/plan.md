

# Wäsche-Spalte in Buchungsübersicht (rechts neben Services)

## Änderung

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

### 1. Neue Query für Wäschebestellungen
Analog zur bestehenden `serviceTasks`-Query eine neue `useQuery` für `linen_orders` hinzufügen:
```typescript
const { data: linenOrders } = useQuery({
  queryKey: ['linen-orders-overview'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('linen_orders')
      .select('id, booking_id, status, items, total_items');
    if (error) throw error;
    return data;
  },
});
```

### 2. Helper-Funktion `getLinenInfo`
Filtert Wäschebestellungen nach `booking_id` und zeigt Status-Badge:
- `offen` → 🟠 "offen"
- `ausstehend` → 🟡 "ausstehend"  
- `delivered` → 🟢 "geliefert"
- `cancelled` → 🔴 "storniert"
- Keine Bestellung → `-`

### 3. Spalte einfügen
- **Header:** Neue `<TableHead>Wäsche</TableHead>` zwischen "Services" und "Aktionen" (nach Zeile 755)
- **Body:** Neue `<TableCell>` mit `getLinenInfo(booking.id)` zwischen Services-Cell und Aktionen-Cell (nach Zeile 810)


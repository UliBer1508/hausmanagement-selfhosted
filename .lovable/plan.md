
# Plan: Stornierte Wäschebestellungen bei aktiven Buchungen zurücksetzen

## Problem-Übersicht
Die Datenbank enthält **6 stornierte Wäschebestellungen** für bestätigte Buchungen:
- **Helena Kunz** (Wald Chalet, Check-in: 30.5.2026)
- **Dot Shaw** (Wald Chalet, Check-in: 20.6.2026)
- **Joke Hauters** (Wald Chalet, Check-in: 1.7.2026)
- **Christiaan Van Der Horst** (Wald Chalet, Check-in: 2.8.2026)
- **Christian Mueller** (Venedigersiedlung Chalet, Check-in: 9.8.2026)
- **Bernd Wagner** (Venedigersiedlung Chalet, Check-in: 19.12.2026)

Alle wurden mit der Notiz **"Auto-storniert: Überschüssige Bestellung (Limit: 3 lookahead)"** gekennzeichnet, obwohl die zugehörigen Buchungen aktiv (`status = 'confirmed'`) sind.

## Ursache
Eine Datenbank-Migration vom 3. Januar 2026 hat eine "3 lookahead"-Regel implementiert, die automatisch erstellte Bestellungen storniert, wenn mehr als 3 Bestellungen pro Haus vorhanden sind. Dies war zu aggressiv und hat auch Bestellungen für tatsächliche bestätigte Buchungen gelöscht.

## Lösung
Die stornierten Bestellungen sollten auf den Status **`offen`** zurückgesetzt werden, damit sie erneut genehmigt werden können. Dies ist der richtige initiale Status für automatisch erstellte Bestellungen (vor Genehmigung durch den Benutzer).

### Technische Implementierung
**SQL-Befehl:**
```sql
UPDATE linen_orders
SET status = 'offen'
WHERE status = 'cancelled' 
  AND booking_id IN (
    SELECT b.id FROM bookings b 
    WHERE b.status = 'confirmed'
  )
  AND notes LIKE '%Auto-storniert: Überschüssige Bestellung%'
  AND order_source = 'auto_booking_lookahead';
```

Dies wird:
- ✅ **6 Bestellungen** auf Status `offen` zurücksetzen
- ✅ **Nur** automatisch erstellte Bestellungen betreffen (nicht manuelle)
- ✅ **Nur bei aktiven Buchungen** aktualisieren
- ✅ **Keine anderen Daten** ändern (Artikel, Mengen, Lieferdaten bleiben erhalten)

### Nach dem Reset
- Benutzer sieht die Bestellungen wieder in der **Wäschebestellungs-Liste** mit Status "Offen"
- Sie können genehmigt oder bearbeitet werden
- Im **Dashboard** erscheint eine Warnung für die 6 ausstehenden Genehmigungen

## Ablauf
1. **SQL UPDATE ausführen** → 6 Bestellungen zurücksetzen
2. **Dashboard überprüfen** → Wäsche-Genehmigungswarnung sollte wieder sichtbar sein
3. **Benutzer kann dann entscheiden**: Genehmigen, Bearbeiten oder Stornieren

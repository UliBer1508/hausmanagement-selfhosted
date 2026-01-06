# Wäsche Oberpinzgau - Externe Synchronisation

> ⚠️ **WICHTIG**: Dies ist die Dokumentation für **Wäsche Oberpinzgau** (externe Datenbank).  
> Für das **Teuni Portal** (interne DB, kein Sync) siehe: `docs/Waesche-Systeme-Uebersicht.md`

## Übersicht

Die Wäsche Oberpinzgau Synchronisation ermöglicht das Übertragen von Wäschebestellungen aus dem internen System (Logik) an das **externe Wäsche Oberpinzgau Portal**. Die Synchronisation erfolgt über eine **direkte Supabase-Datenbankverbindung** zur externen Datenbank.

## Architektur

```
┌─────────────────────┐         ┌─────────────────────────────┐
│   INTERNE SUPABASE  │         │  EXTERNE SUPABASE           │
│   (Logik App)       │         │  (Wäsche Oberpinzgau)       │
│   usblrulkcgucxtkh  │         │  pkpnowevagxmhyqlawng       │
├─────────────────────┤         ├─────────────────────────────┤
│ linen_orders        │────────▶│ waeschebestellungen         │
│ linen_order_items   │────────▶│ bestellpositionen           │
│ houses              │         │ kunden                      │
│ bookings            │         │ objekte                     │
│ external_article_   │         │ waescheartikel              │
│   mapping           │         │                             │
└─────────────────────┘         └─────────────────────────────┘
        │                               │
        │     useExternalSync.ts        │
        └───────────────────────────────┘
              (Direkte DB-Verbindung)
```

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `src/hooks/useExternalSync.ts` | Haupt-Hook für Synchronisation |
| `src/integrations/externalLaundry/client.ts` | Externe Supabase-Client-Konfiguration |
| `src/hooks/useExternalArticleMapping.ts` | Artikel-Mapping-Verwaltung |

## 11-Schritte Workflow

### Schritt 1: Bestelldaten laden
```typescript
const { data: order } = await supabase
  .from('linen_orders')
  .select(`*, bookings(*), houses(*)`)
  .eq('id', linenOrderId)
  .single();
```

### Schritt 2: Artikel-Mapping laden
```typescript
const { data: mappings } = await supabase
  .from('external_article_mapping')
  .select('*');
```

### Schritt 3: Sync-Einstellungen prüfen
Prüft ob externe Synchronisation aktiviert ist (`external_sync_settings.is_enabled`).

### Schritt 4: Kunden-ID ermitteln
```typescript
const { data: kundeData } = await externalLaundryClient
  .from('kunden')
  .select('id')
  .eq('kundennummer', 'K470214') // Feste Kundennummer
  .single();
```

### Schritt 5: Objekt-ID ermitteln
```typescript
const { data: objektData } = await externalLaundryClient
  .from('objekte')
  .select('id')
  .eq('objektnummer', house.external_objektnummer)
  .single();
```

### Schritt 6: Artikel-Katalog laden
```typescript
const { data: artikelKatalog } = await externalLaundryClient
  .from('waescheartikel')
  .select('id, artikelnummer, name');
```

### Schritt 7: Bestellung erstellen
```typescript
const insertData = {
  kunde_id: kundeData.id,
  objekt_id: objektData.id,
  lieferdatum: order.delivery_date,
  status: 'neu',
  notizen: order.notes || null,
  gastname: bookingData?.guest_name || 'Unbekannt',
  check_in: formatDateOnly(bookingData?.check_in),
  check_out: formatDateOnly(bookingData?.check_out),
  anzahl_personen: validateAnzahlPersonen(bookingData?.number_of_guests),
};

const { data: neueBestellung } = await externalLaundryClient
  .from('waeschebestellungen')
  .insert(insertData)
  .select('bestellnummer') // Portal generiert bestellnummer
  .single();
```

### Schritt 8: Bestellpositionen erstellen
Für jeden Artikel mit Menge > 0:
```typescript
await externalLaundryClient
  .from('bestellpositionen')
  .insert({
    bestellung_id: neueBestellung.id,
    artikel_id: artikelUUID,
    menge: item.quantity,
  });
```

### Schritt 9: History-Eintrag erstellen
```typescript
await externalLaundryClient
  .from('bestellung_history')
  .insert({
    bestellung_id: neueBestellung.id,
    status: 'neu',
    notizen: 'Bestellung automatisch aus Logik-App übertragen',
  });
```

### Schritt 10: Interne Bestellung aktualisieren
```typescript
await supabase
  .from('linen_orders')
  .update({
    external_bestellnummer: neueBestellung.bestellnummer,
    external_synced_at: new Date().toISOString(),
  })
  .eq('id', linenOrderId);
```

### Schritt 11: Erfolg zurückgeben
```typescript
return { success: true, bestellnummer: neueBestellung.bestellnummer };
```

## Validierungsfunktionen

### validateAnzahlPersonen
Verhindert das Senden ungültiger Personenzahlen (z.B. Timestamps).

```typescript
const validateAnzahlPersonen = (value: unknown): number => {
  const num = Number(value);
  // Gültige Personenzahl: 1-50 (fängt Timestamps und andere ungültige Werte ab)
  if (isNaN(num) || num < 1 || num > 50) {
    console.warn(`⚠️ Ungültige anzahl_personen: ${value} - Verwende Standard 1`);
    return 1;
  }
  return Math.floor(num); // Sicherstellen dass es ein Integer ist
};
```

**Hintergrund:** Ein Bug führte dazu, dass ein Unix-Timestamp (1765292951713) als `anzahl_personen` gesendet wurde, was einen "integer out of range" Fehler im externen Portal verursachte.

### formatDateOnly
Konvertiert ISO-Datumstrings in reines Datumsformat.

```typescript
const formatDateOnly = (isoDate: string | null | undefined): string | null => {
  if (!isoDate) return null;
  return isoDate.split('T')[0]; // "2024-12-20T14:00:00.000Z" → "2024-12-20"
};
```

### Array-Handling für Supabase Relations
Supabase kann bei Relations manchmal Arrays statt einzelne Objekte zurückgeben.

```typescript
const bookingData = Array.isArray(order.bookings) 
  ? order.bookings[0] 
  : order.bookings;
```

## Artikel-Mapping mit Farbvarianten

### Mapping-Struktur
Interner Artikel-Key + Farbe → Externe Artikelnummer

| Interner Key | Farbe | Externes Mapping |
|--------------|-------|------------------|
| `bedding` | `grey_striped` | `WA001` |
| `bedding` | `white_striped` | `WA005` |
| `large_towels` | `white` | `WA002` |
| `large_towels` | `grey` | `WA006` |

### Mapping-Logik
```typescript
// Mapping-Key konstruieren: itemKey + "__" + color (doppelter Unterstrich)
const mappingKey = item.color 
  ? `${item.item_key}__${item.color}` 
  : item.item_key;

// Externe Artikelnummer finden
const externalMapping = mappings.find(m => m.internal_item_key === mappingKey);
const artikelNummer = externalMapping?.external_artikelnummer;

// Artikel-UUID aus Katalog
const artikel = artikelKatalog.find(a => a.artikelnummer === artikelNummer);
const artikelUUID = artikel?.id;
```

## Datenstrukturen

### Externe Bestellung (waeschebestellungen)
```json
{
  "kunde_id": "uuid",
  "objekt_id": "uuid",
  "lieferdatum": "2024-12-26",
  "status": "neu",
  "notizen": "Optional",
  "gastname": "Max Mustermann",
  "check_in": "2024-12-20",
  "check_out": "2024-12-27",
  "anzahl_personen": 6
}
```

### Externe Bestellposition (bestellpositionen)
```json
{
  "bestellung_id": "uuid",
  "artikel_id": "uuid",
  "menge": 6
}
```

## Bestellnummer-Generierung

Die `bestellnummer` wird **nicht** von der Logik-App generiert, sondern vom externen Portal via Datenbank-Trigger.

```sql
-- Externe Datenbank: Trigger generiert bestellnummer
CREATE TRIGGER generate_bestellnummer
BEFORE INSERT ON waeschebestellungen
FOR EACH ROW
EXECUTE FUNCTION generate_order_number();
```

Nach dem INSERT wird die generierte `bestellnummer` zurückgelesen:
```typescript
.select('bestellnummer')
```

## Fehlerbehandlung & Rollback

Bei Fehlern werden bereits erstellte externe Einträge gelöscht:

```typescript
try {
  // ... Bestellung erstellen
} catch (error) {
  // Rollback: Lösche externe Bestellung falls erstellt
  if (neueBestellungId) {
    await externalLaundryClient
      .from('waeschebestellungen')
      .delete()
      .eq('id', neueBestellungId);
  }
  throw error;
}
```

## Voraussetzungen für Synchronisation

| Voraussetzung | Beschreibung |
|---------------|--------------|
| `status = 'pending'` | Nur ausstehende Bestellungen können synchronisiert werden |
| `external_bestellnummer = null` | Bestellung darf noch nicht synchronisiert sein |
| `external_objektnummer` gesetzt | Haus muss externes Objekt zugewiesen haben |
| Artikel-Mapping vorhanden | Alle Artikel müssen gemappt sein |
| Externe Verbindung aktiv | `EXTERNAL_LAUNDRY_API_KEY` und `EXTERNAL_LAUNDRY_ANON_KEY` müssen gesetzt sein |

## UI-Integration

### Sync-Button (LaundryOrderCard)
```tsx
{order.status === 'pending' && !order.external_bestellnummer && (
  <Button onClick={() => syncOrder(order.id)}>
    An Portal senden
  </Button>
)}
```

### Reset-Button (für Tests)
```tsx
{order.external_bestellnummer && (
  <Button onClick={() => resetSync(order.id)}>
    <RotateCcw /> Sync zurücksetzen
  </Button>
)}
```

## Bekannte Probleme & Lösungen

### Problem: "integer out of range" Fehler
**Symptom:** Fehler beim Erstellen der externen Bestellung mit Wert `1765292951713`

**Ursache:** 
1. `order.bookings` war ein Array statt ein Objekt
2. Direkter Zugriff auf `order.bookings.number_of_guests` gab `undefined` zurück
3. Fallback-Logik griff nicht korrekt

**Lösung:**
1. Array-Check für `order.bookings` hinzugefügt
2. `validateAnzahlPersonen()` Funktion implementiert
3. Validierung auf Bereich 1-50 beschränkt

### Problem: Falsches Datumsformat
**Symptom:** Externe Datenbank akzeptiert keine ISO-Timestamps

**Lösung:** `formatDateOnly()` konvertiert zu `YYYY-MM-DD`

## Debug-Logging

Bei Problemen zeigt die Konsole detaillierte Logs:

```
=== DEBUG: Externe Bestellung erstellen ===
order.bookings (RAW): {...}
bookingData (nach Array-Check): {...}
number_of_guests RAW: 6 | Typ: number
check_in RAW: 2024-12-20T00:00:00.000Z
check_out RAW: 2024-12-27T00:00:00.000Z
```

## Zugehörige Secrets

| Secret | Beschreibung |
|--------|--------------|
| `EXTERNAL_LAUNDRY_API_KEY` | Supabase Service Role Key für externes Portal |
| `EXTERNAL_LAUNDRY_ANON_KEY` | Supabase Anon Key für externes Portal |

## Changelog

| Datum | Änderung |
|-------|----------|
| 2024-12 | Initial-Implementierung |
| 2024-12 | Fix: Array-Handling für `order.bookings` |
| 2024-12 | Fix: `validateAnzahlPersonen()` gegen Timestamp-Bug |
| 2024-12 | Bestellnummer wird vom Portal generiert (nicht mehr lokal) |

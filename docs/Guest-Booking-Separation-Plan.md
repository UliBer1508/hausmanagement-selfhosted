# Plan: Gäste-Daten von Buchungen trennen

## Übersicht & Problemstellung

### Aktuelle Struktur
Gästedaten sind derzeit direkt in der `bookings` Tabelle eingebettet:
- `guest_name`, `guest_email`, `guest_phone`
- `guest_street`, `guest_city`, `guest_postal_code`
- `guest_birth_date`, `guest_travel_document`, `nationality`

### Aktuelle Datenlage (Stand: Dezember 2024)
- **97 Buchungen** mit Gastnamen
- **95 eindeutige Gastnamen**
- **17 eindeutige E-Mail-Adressen** (viele NULL)

### Warum Trennung sinnvoll ist
1. **Datenintegrität**: Gastdaten an einem Ort pflegen statt in jeder Buchung
2. **Wiederkehrende Gäste**: Einfache Erkennung und Verknüpfung
3. **Datenqualität**: Einmalige Korrektur gilt für alle Buchungen
4. **Performance**: Kleinere Tabellen, effizientere Queries
5. **DSGVO-Konformität**: Zentrale Stelle für Datenlöschung

### Betroffene Bereiche (50+ Dateien)

#### Gäste-Module
- `GuestManagement.tsx`, `GuestOverview.tsx`, `GuestStats.tsx`
- `GuestSegments.tsx`, `GuestCommunication.tsx`, `GuestAnalytics.tsx`
- `GuestDetailsDialog.tsx`, `GuestEditDialog.tsx`, `GuestEmailDialog.tsx`
- `GuestList.tsx`, `GuestPersonalization.tsx`

#### Buchungs-Module
- `CreateBookingForm.tsx`, `EditBookingDialog.tsx`
- `BookingCard.tsx`, `BookingOverview.tsx`, `ConnectedBookingView.tsx`
- `useBookings.ts`

#### Edge Functions
- `chat-assistant` (search_bookings, search_guests Tools)
- `generate-guest-profile`, `generate-personalized-email`
- `send-gmail`

#### Dashboard & Weitere
- `RealDataDashboard.tsx`, `GuestContactAlertBanner.tsx`
- `useGuestContactReminders.ts`, `useGuestProfile.ts`

---

## Phase 1: Datenbank-Migration (Sicher & Reversibel)

### 1.1 Neue `guests` Tabelle erstellen

```sql
-- Neue Gäste-Tabelle
CREATE TABLE public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  street TEXT,
  city TEXT,
  postal_code TEXT,
  birth_date DATE,
  travel_document TEXT,
  nationality TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eindeutigkeits-Index auf Email (ignoriert NULL)
CREATE UNIQUE INDEX guests_email_unique 
  ON public.guests(email) 
  WHERE email IS NOT NULL AND email != '';

-- updated_at Trigger
CREATE TRIGGER update_guests_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Kommentar
COMMENT ON TABLE public.guests IS 'Zentrale Gäste-Tabelle - getrennt von Buchungen';
```

### 1.2 Daten migrieren (Deduplizierung)

```sql
-- Gäste aus Buchungen extrahieren (Deduplizierung nach Name+Email)
INSERT INTO public.guests (
  name, email, phone, street, city, postal_code, 
  birth_date, travel_document, nationality
)
SELECT DISTINCT ON (guest_name, COALESCE(guest_email, ''))
  guest_name,
  NULLIF(guest_email, ''),
  guest_phone,
  guest_street,
  guest_city,
  guest_postal_code,
  guest_birth_date::date,
  guest_travel_document,
  nationality
FROM public.bookings
WHERE guest_name IS NOT NULL AND guest_name != ''
ORDER BY 
  guest_name, 
  COALESCE(guest_email, ''), 
  updated_at DESC NULLS LAST;
```

### 1.3 Fremdschlüssel in `bookings` hinzufügen

```sql
-- Neue Spalte hinzufügen (nullable für Übergangsphase)
ALTER TABLE public.bookings 
  ADD COLUMN guest_id UUID REFERENCES public.guests(id);

-- Index für Performance
CREATE INDEX idx_bookings_guest_id ON public.bookings(guest_id);

-- Verknüpfung herstellen
UPDATE public.bookings b
SET guest_id = g.id
FROM public.guests g
WHERE b.guest_name = g.name 
  AND (
    (b.guest_email = g.email) 
    OR (b.guest_email IS NULL AND g.email IS NULL)
    OR (b.guest_email = '' AND g.email IS NULL)
  );
```

---

## Phase 2: TypeScript Types anpassen

### 2.1 Neue `Guest` Interface

```typescript
// src/types/index.ts

export interface Guest {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  postal_code?: string | null;
  birth_date?: string | null;
  travel_document?: string | null;
  nationality?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Für Buchungen mit JOIN
export interface GuestWithBookingStats extends Guest {
  total_bookings: number;
  total_revenue: number;
  first_booking?: string;
  last_booking?: string;
}
```

### 2.2 Aktualisierte `Booking` Interface

```typescript
export interface Booking {
  id: string;
  house_id: string;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  number_of_adults?: number;
  number_of_children?: number;
  booking_amount?: number;
  status?: BookingStatus;
  // ... andere Felder ...
  
  // NEU: Referenz auf Gast
  guest_id?: string;
  guests?: Guest;  // Für JOINs
  
  // DEPRECATED - Übergangsphase (später entfernen)
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guest_street?: string;
  guest_city?: string;
  guest_postal_code?: string;
  guest_birth_date?: string;
  guest_travel_document?: string;
  nationality?: string;
  
  // Bleibt in bookings (buchungsspezifisch!)
  guest_contact_status?: string;
}
```

---

## Phase 3: Hooks & Queries anpassen

### 3.1 Neuer `useGuests` Hook

```typescript
// src/hooks/useGuests.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Guest } from '@/types';

export const useGuests = () => {
  return useQuery({
    queryKey: ['guests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Guest[];
    }
  });
};

export const useGuest = (guestId: string) => {
  return useQuery({
    queryKey: ['guest', guestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('id', guestId)
        .single();
      
      if (error) throw error;
      return data as Guest;
    },
    enabled: !!guestId
  });
};

export const useGuestWithBookings = (guestId: string) => {
  return useQuery({
    queryKey: ['guest', guestId, 'bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guests')
        .select(`
          *,
          bookings (
            id, check_in, check_out, status, booking_amount,
            number_of_guests, number_of_adults, number_of_children,
            houses (id, name)
          )
        `)
        .eq('id', guestId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!guestId
  });
};

export const useGuestsWithStats = () => {
  return useQuery({
    queryKey: ['guests', 'with-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guests')
        .select(`
          *,
          bookings (
            id, check_in, booking_amount, status
          )
        `)
        .order('name');
      
      if (error) throw error;
      
      // Statistiken berechnen
      return data?.map(guest => ({
        ...guest,
        total_bookings: guest.bookings?.filter(b => b.status !== 'cancelled').length || 0,
        total_revenue: guest.bookings?.reduce((sum, b) => sum + (b.booking_amount || 0), 0) || 0,
        first_booking: guest.bookings?.sort((a, b) => 
          new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
        )[0]?.check_in,
        last_booking: guest.bookings?.sort((a, b) => 
          new Date(b.check_in).getTime() - new Date(a.check_in).getTime()
        )[0]?.check_in
      }));
    }
  });
};

export const useCreateGuest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (guest: Omit<Guest, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('guests')
        .insert(guest)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guests'] });
    }
  });
};

export const useUpdateGuest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Guest> & { id: string }) => {
      const { data, error } = await supabase
        .from('guests')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.invalidateQueries({ queryKey: ['guest', variables.id] });
    }
  });
};
```

### 3.2 Buchungs-Queries mit JOIN

```typescript
// Vorher:
const { data } = await supabase
  .from('bookings')
  .select('*, houses(*)')

// Nachher:
const { data } = await supabase
  .from('bookings')
  .select('*, houses(*), guests(*)')
```

### 3.3 Fallback-Logik für Übergangsphase

```typescript
// Helper-Funktion für Übergangsphase
const getGuestName = (booking: Booking): string => {
  return booking.guests?.name || booking.guest_name || 'Unbekannter Gast';
};

const getGuestEmail = (booking: Booking): string | null => {
  return booking.guests?.email || booking.guest_email || null;
};
```

---

## Phase 4: UI-Komponenten anpassen

### 4.1 Gäste-Module (Priorität 1)

| Datei | Änderung |
|-------|----------|
| `GuestOverview.tsx` | Query auf `guests` Tabelle umstellen, `useGuestsWithStats()` nutzen |
| `GuestStats.tsx` | Direkt aus `guests` + JOIN zu Buchungen |
| `GuestAnalytics.tsx` | Queries auf neue Struktur anpassen |
| `GuestSegments.tsx` | Segmentierung basierend auf `guests` Tabelle |
| `GuestDetailsDialog.tsx` | `Guest` Interface statt aggregiertem Objekt |
| `GuestEditDialog.tsx` | `guests` Tabelle aktualisieren (nicht mehr alle Buchungen!) |
| `GuestList.tsx` | Auf `useGuests()` umstellen |

### 4.2 Buchungs-Module (Priorität 2)

| Datei | Änderung |
|-------|----------|
| `CreateBookingForm.tsx` | Gast-Dropdown hinzufügen ODER "Neuen Gast anlegen" Option |
| `EditBookingDialog.tsx` | Gast-Auswahl + Link zu Gastprofil |
| `BookingCard.tsx` | `booking.guests?.name` statt `booking.guest_name` |
| `ConnectedBookingView.tsx` | JOIN auf `guests` anpassen |
| `BookingOverviewFixed.tsx` | Gast-Anzeige über JOIN |

### 4.3 Edge Functions (Priorität 3)

| Funktion | Änderung |
|----------|----------|
| `chat-assistant` | `search_guests` Tool auf `guests` Tabelle umstellen |
| `generate-guest-profile` | `guest_id` statt `guest_email` für Verknüpfung |
| `generate-personalized-email` | Gast-Daten aus `guests` Tabelle laden |
| `send-gmail` | Empfänger-Email aus `guests` Tabelle |

### 4.4 Dashboard & Weitere

| Datei | Änderung |
|-------|----------|
| `GuestContactAlertBanner.tsx` | JOIN auf `guests` für Anzeige |
| `useGuestContactReminders.ts` | Query anpassen |
| `RealDataDashboard.tsx` | Gäste-Statistik aus `guests` Tabelle |

---

## Phase 5: Aufräumen (Nach vollständiger Migration)

### 5.1 Validierung vor Cleanup

```sql
-- Prüfen ob alle Buchungen einen guest_id haben
SELECT COUNT(*) as ohne_guest_id
FROM public.bookings 
WHERE guest_id IS NULL AND guest_name IS NOT NULL;

-- Sollte 0 zurückgeben!
```

### 5.2 Alte Spalten entfernen

⚠️ **NUR nach erfolgreicher Migration und umfangreichen Tests!**

```sql
-- Alte Gast-Spalten aus bookings entfernen
ALTER TABLE public.bookings 
  DROP COLUMN IF EXISTS guest_name,
  DROP COLUMN IF EXISTS guest_email,
  DROP COLUMN IF EXISTS guest_phone,
  DROP COLUMN IF EXISTS guest_street,
  DROP COLUMN IF EXISTS guest_city,
  DROP COLUMN IF EXISTS guest_postal_code,
  DROP COLUMN IF EXISTS guest_birth_date,
  DROP COLUMN IF EXISTS guest_travel_document,
  DROP COLUMN IF EXISTS nationality;

-- WICHTIG: guest_contact_status BLEIBT in bookings (ist buchungsspezifisch!)
```

### 5.3 NOT NULL Constraint hinzufügen

```sql
-- Erst wenn alle Buchungen einen Gast haben
ALTER TABLE public.bookings 
  ALTER COLUMN guest_id SET NOT NULL;
```

---

## ⚠️ Risikominimierung

### Sicherheitsmaßnahmen

1. **Parallelstruktur**: Alte `guest_*` Spalten bleiben während gesamter Migration erhalten
2. **Fallback-Logik**: Komponenten prüfen `booking.guests?.name || booking.guest_name`
3. **Schrittweise Migration**: Phase für Phase mit Testen dazwischen
4. **Rollback möglich**: Alte Spalten werden erst ganz am Ende gelöscht
5. **Backup vor Phase 5**: Vollständiges Datenbank-Backup vor Spalten-Löschung

### Rollback-Plan

Falls Probleme auftreten:
1. `guest_id` Spalte kann jederzeit ignoriert werden
2. Alte Spalten sind noch vorhanden
3. Code-Änderungen können revertiert werden
4. Keine Datenverluste möglich

---

## 📋 Aufwandsschätzung

| Phase | Aufwand | Risiko | Beschreibung |
|-------|---------|--------|--------------|
| Phase 1 | 1 Session | Niedrig | Nur DB-Änderungen, kein Code |
| Phase 2 | 1 Session | Niedrig | TypeScript Types erweitern |
| Phase 3 | 1-2 Sessions | Mittel | Hooks erstellen und testen |
| Phase 4.1 | 2 Sessions | Mittel | Gäste-Module anpassen |
| Phase 4.2 | 1-2 Sessions | Mittel-Hoch | Buchungs-Module anpassen |
| Phase 4.3 | 1 Session | Mittel | Edge Functions anpassen |
| Phase 5 | 1 Session | Niedrig | Cleanup nach Validierung |

**Gesamtaufwand: ~7-9 Sessions**

---

## 📅 Empfohlene Reihenfolge

1. ✅ Phase 1.1: `guests` Tabelle erstellen
2. ✅ Phase 1.2: Daten migrieren
3. ✅ Phase 1.3: `guest_id` Spalte hinzufügen
4. ✅ Phase 2: TypeScript Types
5. ✅ Phase 3: Hooks erstellen
6. 🔄 Phase 4.1: Gäste-Module (wichtigste zuerst)
7. 🔄 Phase 4.2: Buchungs-Module
8. 🔄 Phase 4.3: Edge Functions
9. ⏳ Phase 5: Cleanup (erst nach 2-4 Wochen stabiler Nutzung)

---

## 🔗 Verwandte Dokumentation

- [Wäschebestellungs-Logik (Zero-Stock)](./Waeschebestellungs-Logik-Zero-Stock.md)
- [AI-Assistant Testing](./AI-Assistant-Testing.md)
- [Linen Management Concept](./Linen-Management-Concept.md)

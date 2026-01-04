import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GuestWithBookingCount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  city: string | null;
  street: string | null;
  postal_code: string | null;
  birth_date: string | null;
  travel_document: string | null;
  notes: string | null;
  created_at: string;
  booking_count: number;
}

export interface DuplicateGroup {
  normalizedName: string;
  guests: GuestWithBookingCount[];
  totalBookings: number;
}

// Normalisiert deutsche Umlaute für Vergleiche
const normalizeGermanName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
};

export const useGuestDuplicates = () => {
  return useQuery({
    queryKey: ['guest-duplicates'],
    queryFn: async (): Promise<DuplicateGroup[]> => {
      // Lade alle Gäste mit Buchungsanzahl
      const { data: guests, error } = await supabase
        .from('guests')
        .select('id, name, email, phone, nationality, city, street, postal_code, birth_date, travel_document, notes, created_at');
      
      if (error) throw error;
      if (!guests) return [];

      // Lade Buchungen pro Gast
      const { data: bookings } = await supabase
        .from('bookings')
        .select('guest_id');
      
      const bookingCounts: Record<string, number> = {};
      bookings?.forEach(b => {
        if (b.guest_id) {
          bookingCounts[b.guest_id] = (bookingCounts[b.guest_id] || 0) + 1;
        }
      });

      // Gruppiere nach normalisiertem Namen
      const nameGroups: Record<string, GuestWithBookingCount[]> = {};
      
      guests.forEach(guest => {
        const normalized = normalizeGermanName(guest.name);
        if (!nameGroups[normalized]) {
          nameGroups[normalized] = [];
        }
        nameGroups[normalized].push({
          ...guest,
          booking_count: bookingCounts[guest.id] || 0
        });
      });

      // Filtere nur Gruppen mit Duplikaten (mehr als 1 Eintrag)
      const duplicateGroups: DuplicateGroup[] = Object.entries(nameGroups)
        .filter(([_, guests]) => guests.length > 1)
        .map(([normalizedName, guests]) => ({
          normalizedName,
          guests: guests.sort((a, b) => 
            // Sortiere: Meiste Buchungen zuerst, dann nach Erstelldatum
            b.booking_count - a.booking_count || 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ),
          totalBookings: guests.reduce((sum, g) => sum + g.booking_count, 0)
        }))
        .sort((a, b) => b.guests.length - a.guests.length);

      return duplicateGroups;
    }
  });
};

interface MergeGuestsParams {
  targetGuestId: string;
  sourceGuestIds: string[];
  mergedData: Partial<GuestWithBookingCount>;
}

export const useMergeGuests = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ targetGuestId, sourceGuestIds, mergedData }: MergeGuestsParams) => {
      console.log('🔄 Merging guests:', { targetGuestId, sourceGuestIds, mergedData });
      
      // 1. Aktualisiere Ziel-Gast mit zusammengeführten Daten
      const { error: updateError } = await supabase
        .from('guests')
        .update({
          name: mergedData.name,
          email: mergedData.email,
          phone: mergedData.phone,
          nationality: mergedData.nationality,
          city: mergedData.city,
          street: mergedData.street,
          postal_code: mergedData.postal_code,
          birth_date: mergedData.birth_date,
          travel_document: mergedData.travel_document,
          notes: mergedData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetGuestId);
      
      if (updateError) throw updateError;

      // 2. Verknüpfe alle Buchungen auf Ziel-Gast
      if (sourceGuestIds.length > 0) {
        const { error: bookingsError } = await supabase
          .from('bookings')
          .update({ guest_id: targetGuestId })
          .in('guest_id', sourceGuestIds);
        
        if (bookingsError) throw bookingsError;

        // 3. Lösche Duplikate
        const { error: deleteError } = await supabase
          .from('guests')
          .delete()
          .in('id', sourceGuestIds);
        
        if (deleteError) throw deleteError;
      }

      return { success: true, deletedCount: sourceGuestIds.length };
    },
    onSuccess: (result) => {
      toast.success(`${result.deletedCount} Duplikat(e) zusammengeführt`);
      queryClient.invalidateQueries({ queryKey: ['guest-duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (error) => {
      console.error('❌ Merge failed:', error);
      toast.error('Fehler beim Zusammenführen der Gäste');
    }
  });
};

// Hilfsfunktion: Beste Daten aus mehreren Gästen zusammenführen
export const getMergedGuestData = (guests: GuestWithBookingCount[]): Partial<GuestWithBookingCount> => {
  const merged: Partial<GuestWithBookingCount> = {
    name: guests[0]?.name || '',
  };

  // Für jedes Feld: Nimm den ersten nicht-leeren Wert
  const fields = ['email', 'phone', 'nationality', 'city', 'street', 'postal_code', 'birth_date', 'travel_document', 'notes'] as const;
  
  fields.forEach(field => {
    for (const guest of guests) {
      const value = guest[field];
      if (value && value.toString().trim() !== '') {
        (merged as any)[field] = value;
        break;
      }
    }
  });

  return merged;
};

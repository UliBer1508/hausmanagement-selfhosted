import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Aggregiert die Anzahl Aufenthalte pro Gast (per E-Mail).
 * Logik analog useGuests.ts: zählt Buchungen mit Status
 * confirmed/checked_in/completed.
 */
export const useGuestStayCounts = () => {
  return useQuery({
    queryKey: ['guest-stay-counts'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('guest_email, status')
        .in('status', ['confirmed', 'checked_in', 'completed']);

      if (error) throw error;

      const counts = new Map<string, number>();
      (data ?? []).forEach((b: { guest_email: string | null }) => {
        const key = (b.guest_email || '').trim().toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return counts;
    },
  });
};

/**
 * Liefert Kategorie für eine konkrete Buchung.
 * Zählt die aktuelle Buchung ab, damit eine erste Buchung
 * nicht fälschlich als Stammgast markiert wird.
 */
export const getGuestCategory = (
  counts: Map<string, number> | undefined,
  guestEmail?: string | null
): 'new' | 'returning' => {
  if (!counts || !guestEmail) return 'new';
  const total = counts.get(guestEmail.trim().toLowerCase()) ?? 0;
  // total inkl. aktueller Buchung; vorherige Aufenthalte = total - 1
  return total - 1 >= 1 ? 'returning' : 'new';
};
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getGuestKey, GuestKeyInput } from '@/lib/guestKeyHelpers';

/**
 * Aggregiert die Anzahl Aufenthalte pro Gast. Zählt Buchungen mit Status
 * confirmed/checked_in/completed.
 *
 * WICHTIG (Fix 11.08.2026): Gruppiert über `getGuestKey()`, also primär über
 * `guest_id` — NICHT mehr nur über `guest_email`. Grund: `guest_email` kann
 * bei einer Buchung leer sein, obwohl `guest_id` korrekt gesetzt ist (siehe
 * `src/lib/guestKeyHelpers.ts`). Vorher führte das dazu, dass ein Stammgast
 * mit einer E-Mail-losen Buchung auf der Reservierungs-Karte fälschlich als
 * "Neuer Gast" markiert wurde, obwohl die Gäste-Liste (`useGuests.ts`, die
 * ebenfalls über `guest_id` zählt) ihn korrekt als "Stammgast" zeigte.
 */
export const useGuestStayCounts = () => {
  return useQuery({
    queryKey: ['guest-stay-counts'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('guest_id, guest_email, guest_name, status')
        .in('status', ['confirmed', 'checked_in', 'completed']);

      if (error) throw error;

      const counts = new Map<string, number>();
      (data ?? []).forEach((b: GuestKeyInput) => {
        const key = getGuestKey(b);
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return counts;
    },
  });
};

/**
 * Liefert die Kategorie für eine konkrete Buchung.
 * Zählt die aktuelle Buchung ab, damit eine erste Buchung
 * nicht fälschlich als Stammgast markiert wird.
 */
export const getGuestCategory = (
  counts: Map<string, number> | undefined,
  booking: GuestKeyInput | null | undefined
): 'new' | 'returning' => {
  if (!counts || !booking) return 'new';
  const key = getGuestKey(booking);
  if (!key) return 'new';
  const total = counts.get(key) ?? 0;
  // total inkl. aktueller Buchung; vorherige Aufenthalte = total - 1
  return total - 1 >= 1 ? 'returning' : 'new';
};

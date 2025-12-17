import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MarketingAction {
  id: string;
  name: string;
  description: string | null;
  target_criteria: {
    has_children?: boolean;
    min_nights?: number;
    nationality?: string;
    booking_amount_min?: number;
    is_returning_guest?: boolean;
  };
  status: string;
}

interface ActionTracking {
  id: string;
  booking_id: string;
  action_id: string;
  action_applied: boolean;
  applied_at: string | null;
}

interface BookingMarketingMatch {
  action: MarketingAction;
  tracking: ActionTracking | null;
  isApplied: boolean;
}

interface BookingForMatching {
  id: string;
  number_of_children?: number | null;
  number_of_adults?: number | null;
  number_of_guests?: number;
  check_in?: string;
  check_out?: string;
  booking_amount?: number | null;
  nationality?: string | null;
  guest_email?: string | null;
}

// Helper: Prüft ob eine Buchung den Kriterien einer Aktion entspricht
function matchesCriteria(
  booking: BookingForMatching,
  criteria: MarketingAction['target_criteria']
): boolean {
  // has_children: Buchung muss Kinder haben
  if (criteria.has_children && (!booking.number_of_children || booking.number_of_children <= 0)) {
    return false;
  }

  // min_nights: Mindestaufenthalt
  if (criteria.min_nights && booking.check_in && booking.check_out) {
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    if (nights < criteria.min_nights) {
      return false;
    }
  }

  // nationality: Nationalität muss übereinstimmen
  if (criteria.nationality && booking.nationality) {
    if (!booking.nationality.toLowerCase().includes(criteria.nationality.toLowerCase())) {
      return false;
    }
  }

  // booking_amount_min: Mindestbuchungsbetrag
  if (criteria.booking_amount_min && (!booking.booking_amount || booking.booking_amount < criteria.booking_amount_min)) {
    return false;
  }

  return true;
}

export const useBookingMarketingActions = (bookings: BookingForMatching[]) => {
  const queryClient = useQueryClient();
  const bookingIds = bookings.map(b => b.id);

  // 1. Aktive Marketing-Aktionen laden
  const { data: marketingActions } = useQuery({
    queryKey: ['marketing-actions-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_actions')
        .select('*')
        .eq('status', 'active');
      
      if (error) throw error;
      return data as MarketingAction[];
    },
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // 2. Tracking für diese Buchungen laden
  const { data: actionTracking } = useQuery({
    queryKey: ['booking-action-tracking', bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .in('booking_id', bookingIds);
      
      if (error) throw error;
      return data as ActionTracking[];
    },
    staleTime: 1000 * 60 * 2, // 2 Minuten
  });

  // 3. Toggle-Mutation für action_applied
  const toggleMutation = useMutation({
    mutationFn: async ({ bookingId, actionId, applied }: { bookingId: string; actionId: string; applied: boolean }) => {
      // Prüfen ob bereits ein Tracking existiert
      const { data: existing } = await supabase
        .from('booking_action_tracking')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('action_id', actionId)
        .maybeSingle();

      if (existing) {
        // Update
        const { error } = await supabase
          .from('booking_action_tracking')
          .update({ 
            action_applied: applied,
            applied_at: applied ? new Date().toISOString() : null
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('booking_action_tracking')
          .insert({
            booking_id: bookingId,
            action_id: actionId,
            action_applied: applied,
            applied_at: applied ? new Date().toISOString() : null
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-action-tracking'] });
    },
  });

  // 4. Map erstellen: booking_id → Liste von passenden Aktionen
  const bookingActionsMap = new Map<string, BookingMarketingMatch[]>();

  if (marketingActions && bookings.length > 0) {
    bookings.forEach(booking => {
      const matches: BookingMarketingMatch[] = [];
      
      marketingActions.forEach(action => {
        if (matchesCriteria(booking, action.target_criteria || {})) {
          const tracking = actionTracking?.find(
            t => t.booking_id === booking.id && t.action_id === action.id
          ) || null;
          
          matches.push({
            action,
            tracking,
            isApplied: tracking?.action_applied || false,
          });
        }
      });

      if (matches.length > 0) {
        bookingActionsMap.set(booking.id, matches);
      }
    });
  }

  return {
    bookingActionsMap,
    toggleAction: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
    actionsCount: marketingActions?.length || 0,
  };
};

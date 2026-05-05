import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { todayISO } from '@/lib/dateHelpers';

export interface MarketingAction {
  id: string;
  name: string;
  description: string | null;
  target_criteria: TargetCriteria;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface TargetCriteria {
  has_children?: boolean;
  min_stays?: number;
  nationality?: string;
  min_nights?: number;
}

export interface BookingActionTracking {
  id: string;
  booking_id: string;
  action_id: string;
  action_applied: boolean;
  applied_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ActionStats {
  // Planung (zukünftige Buchungen)
  planningTotal: number;
  planningApplied: number;
  planningPending: number;
  
  // Auswertung (vergangene Buchungen mit angewendeter Aktion)
  evaluationTotal: number;
  evaluationWithRating: number;
  avgRating: number | null;
}

export const useMarketingActions = () => {
  const queryClient = useQueryClient();

  // Fetch all marketing actions
  const { data: actions, isLoading: isLoadingActions } = useQuery({
    queryKey: ['marketing-actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_actions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MarketingAction[];
    },
  });

  // Create a new marketing action
  const createAction = useMutation({
    mutationFn: async (action: {
      name: string;
      description?: string | null;
      target_criteria: Record<string, any>;
      start_date: string;
      end_date?: string | null;
      status: string;
    }) => {
      const { data, error } = await supabase
        .from('marketing_actions')
        .insert({
          name: action.name,
          description: action.description,
          target_criteria: action.target_criteria,
          start_date: action.start_date,
          end_date: action.end_date,
          status: action.status,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-actions'] });
      toast.success('Marketing-Aktion erstellt');
    },
    onError: (error) => {
      toast.error('Fehler beim Erstellen der Aktion');
      console.error(error);
    },
  });

  // Update a marketing action
  const updateAction = useMutation({
    mutationFn: async ({ id, ...updates }: { 
      id: string;
      name?: string;
      description?: string | null;
      target_criteria?: Record<string, any>;
      start_date?: string;
      end_date?: string | null;
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from('marketing_actions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-actions'] });
      toast.success('Aktion aktualisiert');
    },
    onError: (error) => {
      toast.error('Fehler beim Aktualisieren');
      console.error(error);
    },
  });

  // Delete a marketing action
  const deleteAction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('marketing_actions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-actions'] });
      toast.success('Aktion gelöscht');
    },
    onError: (error) => {
      toast.error('Fehler beim Löschen');
      console.error(error);
    },
  });

  return {
    actions,
    isLoadingActions,
    createAction,
    updateAction,
    deleteAction,
  };
};

// Helper to filter bookings by criteria
const filterBookingsByCriteria = (bookings: any[], targetCriteria: TargetCriteria) => {
  return bookings.filter(booking => {
    if (targetCriteria.has_children && (booking.number_of_children || 0) === 0) {
      return false;
    }
    if (targetCriteria.nationality && booking.nationality !== targetCriteria.nationality) {
      return false;
    }
    if (targetCriteria.min_nights) {
      const checkIn = new Date(booking.check_in);
      const checkOut = new Date(booking.check_out);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      if (nights < targetCriteria.min_nights) {
        return false;
      }
    }
    return true;
  });
};

export const useActionStats = (actionId: string, targetCriteria: TargetCriteria) => {
  return useQuery({
    queryKey: ['action-stats', actionId],
    queryFn: async (): Promise<ActionStats> => {
      const today = todayISO();
      
      // Get ALL tourist bookings (both future and past)
      const { data: allBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          check_in,
          check_out,
          number_of_guests,
          number_of_children,
          nationality,
          status,
          normalized_rating,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled');

      if (bookingsError) throw bookingsError;

      // Get tracking data for this action
      const { data: trackingData, error: trackingError } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .eq('action_id', actionId);

      if (trackingError) throw trackingError;

      // Filter by criteria
      const affectedBookings = filterBookingsByCriteria(allBookings || [], targetCriteria);

      // Split into future (planning) and past (evaluation)
      const futureBookings = affectedBookings.filter(b => b.check_in >= today);
      const pastBookings = affectedBookings.filter(b => b.check_out < today);

      // Planning stats
      const futureApplied = futureBookings.filter(b => 
        trackingData?.some(t => t.booking_id === b.id && t.action_applied)
      ).length;

      // Evaluation: Only past bookings where action was applied
      const pastWithAction = pastBookings.filter(b => 
        trackingData?.some(t => t.booking_id === b.id && t.action_applied)
      );
      const pastWithRating = pastWithAction.filter(b => b.normalized_rating !== null);
      
      const avgRating = pastWithRating.length > 0
        ? pastWithRating.reduce((sum, b) => sum + (b.normalized_rating || 0), 0) / pastWithRating.length
        : null;

      return {
        planningTotal: futureBookings.length,
        planningApplied: futureApplied,
        planningPending: futureBookings.length - futureApplied,
        evaluationTotal: pastWithAction.length,
        evaluationWithRating: pastWithRating.length,
        avgRating,
      };
    },
    enabled: !!actionId,
  });
};

export const useAffectedBookings = (
  actionId: string, 
  targetCriteria: TargetCriteria,
  mode: 'planning' | 'evaluation' = 'planning'
) => {
  return useQuery({
    queryKey: ['affected-bookings', actionId, targetCriteria, mode],
    queryFn: async () => {
      const today = todayISO();
      
      // Build query based on mode
      let query = supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          check_in,
          check_out,
          number_of_guests,
          number_of_children,
          nationality,
          status,
          external_rating,
          normalized_rating,
          platform,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled')
        .order('check_in', { ascending: mode === 'planning' });

      if (mode === 'planning') {
        // Future bookings for planning
        query = query.gte('check_in', today);
      } else {
        // Past bookings for evaluation
        query = query.lt('check_out', today);
      }

      const { data: bookings, error: bookingsError } = await query;
      if (bookingsError) throw bookingsError;

      // Filter bookings by criteria
      const affectedBookings = filterBookingsByCriteria(bookings || [], targetCriteria);

      // Get tracking data
      const { data: trackingData } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .eq('action_id', actionId);

      // For evaluation mode: only show bookings where action was applied
      let filteredBookings = affectedBookings;
      if (mode === 'evaluation') {
        filteredBookings = affectedBookings.filter(b => 
          trackingData?.some(t => t.booking_id === b.id && t.action_applied)
        );
      }

      // Combine data
      return filteredBookings.map(booking => {
        const tracking = trackingData?.find(t => t.booking_id === booking.id);
        
        return {
          ...booking,
          actionApplied: tracking?.action_applied || false,
          appliedAt: tracking?.applied_at || null,
          trackingNotes: tracking?.notes || null,
          trackingId: tracking?.id || null,
          rating: booking.normalized_rating,
        };
      });
    },
    enabled: !!actionId,
  });
};

export const useBookingActionTracking = () => {
  const queryClient = useQueryClient();

  const toggleActionApplied = useMutation({
    mutationFn: async ({ 
      bookingId, 
      actionId, 
      applied, 
      notes 
    }: { 
      bookingId: string; 
      actionId: string; 
      applied: boolean;
      notes?: string;
    }) => {
      // Try to update existing or insert new
      const { data: existing } = await supabase
        .from('booking_action_tracking')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('action_id', actionId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('booking_action_tracking')
          .update({
            action_applied: applied,
            applied_at: applied ? new Date().toISOString() : null,
            notes: notes || null,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('booking_action_tracking')
          .insert({
            booking_id: bookingId,
            action_id: actionId,
            action_applied: applied,
            applied_at: applied ? new Date().toISOString() : null,
            notes: notes || null,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affected-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['action-stats'] });
      toast.success('Status aktualisiert');
    },
    onError: (error) => {
      toast.error('Fehler beim Aktualisieren');
      console.error(error);
    },
  });

  return { toggleActionApplied };
};

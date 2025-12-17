import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

export interface ActionWithStats extends MarketingAction {
  totalAffected: number;
  applied: number;
  pending: number;
  reviewsCount: number;
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

export const useActionStats = (actionId: string, targetCriteria: TargetCriteria) => {
  return useQuery({
    queryKey: ['action-stats', actionId],
    queryFn: async () => {
      // Get all tourist bookings
      const { data: bookings, error: bookingsError } = await supabase
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
          houses!inner(id, name, rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled');

      if (bookingsError) throw bookingsError;

      // Filter bookings by criteria
      const affectedBookings = (bookings || []).filter(booking => {
        // Has children criteria
        if (targetCriteria.has_children && (booking.number_of_children || 0) === 0) {
          return false;
        }

        // Nationality criteria
        if (targetCriteria.nationality && booking.nationality !== targetCriteria.nationality) {
          return false;
        }

        // Min nights criteria
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

      // Get tracking data for this action
      const { data: trackingData, error: trackingError } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .eq('action_id', actionId);

      if (trackingError) throw trackingError;

      const appliedCount = (trackingData || []).filter(t => t.action_applied).length;

      // Get reviews for affected bookings
      const affectedBookingIds = affectedBookings.map(b => b.id);
      const { data: reviews, error: reviewsError } = await supabase
        .from('app_reviews')
        .select('rating, booking_id')
        .in('booking_id', affectedBookingIds.length > 0 ? affectedBookingIds : ['no-match']);

      if (reviewsError) throw reviewsError;

      const reviewsCount = reviews?.length || 0;
      const avgRating = reviewsCount > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
        : null;

      return {
        totalAffected: affectedBookings.length,
        applied: appliedCount,
        pending: affectedBookings.length - appliedCount,
        reviewsCount,
        avgRating,
        affectedBookings,
      };
    },
    enabled: !!actionId,
  });
};

export const useAffectedBookings = (actionId: string, targetCriteria: TargetCriteria) => {
  return useQuery({
    queryKey: ['affected-bookings', actionId, targetCriteria],
    queryFn: async () => {
      // Get all tourist bookings
      const { data: bookings, error: bookingsError } = await supabase
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
          houses!inner(id, name, rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled')
        .order('check_in', { ascending: true });

      if (bookingsError) throw bookingsError;

      // Filter bookings by criteria
      const affectedBookings = (bookings || []).filter(booking => {
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

      // Get tracking data
      const { data: trackingData } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .eq('action_id', actionId);

      // Get reviews
      const bookingIds = affectedBookings.map(b => b.id);
      const { data: reviews } = await supabase
        .from('app_reviews')
        .select('booking_id, rating')
        .in('booking_id', bookingIds.length > 0 ? bookingIds : ['no-match']);

      // Combine data
      return affectedBookings.map(booking => {
        const tracking = trackingData?.find(t => t.booking_id === booking.id);
        const review = reviews?.find(r => r.booking_id === booking.id);
        
        return {
          ...booking,
          actionApplied: tracking?.action_applied || false,
          appliedAt: tracking?.applied_at || null,
          trackingNotes: tracking?.notes || null,
          trackingId: tracking?.id || null,
          rating: review?.rating || null,
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

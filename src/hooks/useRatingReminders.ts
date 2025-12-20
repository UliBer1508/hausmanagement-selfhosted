import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subDays } from "date-fns";
import { useRatingReminderSettings, DEFAULT_RATING_REMINDER_SETTINGS } from "./useSystemSettings";

export interface RatingReminder {
  id: string;
  guest_name: string;
  guest_email: string | null;
  check_out: string;
  platform: string | null;
  house_id: string;
  house_name: string;
  days_since_checkout: number;
  is_marketing_candidate: boolean;
  marketing_action_name?: string;
  action_id?: string;
  action_applied?: boolean;
  number_of_children?: number;
}

export const useRatingReminders = () => {
  const queryClient = useQueryClient();
  const today = new Date();
  
  // Settings aus Datenbank laden
  const { data: settingsData, isLoading: loadingSettings } = useRatingReminderSettings();
  const settings = { ...DEFAULT_RATING_REMINDER_SETTINGS, ...settingsData };
  
  // Datum-Bereich aus Settings berechnen
  const minCheckoutDate = subDays(today, settings.max_days_after_checkout);
  const maxCheckoutDate = subDays(today, settings.min_days_after_checkout);

  // Buchungen ohne Bewertungen laden
  const { data: bookingsWithoutRatings, isLoading: loadingBookings } = useQuery({
    queryKey: ['rating-reminders-bookings', format(today, 'yyyy-MM-dd'), settings],
    enabled: !loadingSettings && settings.is_enabled,
    queryFn: async () => {
      // Basis-Query aufbauen
      let query = supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          check_out,
          platform,
          house_id,
          number_of_children,
          external_rating,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .eq('status', 'completed')
        .gte('check_out', minCheckoutDate.toISOString())
        .lte('check_out', maxCheckoutDate.toISOString())
        .is('external_rating', null)
        .or('rating_not_expected.is.null,rating_not_expected.eq.false')
        .order('check_out', { ascending: false });
      
      // Plattform-Filter anwenden wenn aktiviert
      if (settings.require_platform) {
        query = query.not('platform', 'is', null);
      }
      
      // Rental-Type Filter anwenden
      if (settings.rental_type_filter !== 'all') {
        query = query.eq('houses.rental_type', settings.rental_type_filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 15, // 15 Minuten
  });

  // Mutation: Als "keine Bewertung" markieren
  const markAsNoRatingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ rating_not_expected: true })
        .eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rating-reminders-bookings'] });
    },
  });

  // Aktive Marketing-Aktionen laden
  const { data: marketingActions, isLoading: loadingMarketing } = useQuery({
    queryKey: ['rating-reminders-marketing-actions'],
    enabled: settings.is_enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_actions')
        .select('id, name, target_criteria')
        .eq('status', 'active');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Tracking für diese Buchungen laden
  const bookingIds = bookingsWithoutRatings?.map(b => b.id) || [];
  const { data: actionTracking, isLoading: loadingTracking } = useQuery({
    queryKey: ['rating-reminders-tracking', bookingIds],
    enabled: bookingIds.length > 0 && settings.is_enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_action_tracking')
        .select('booking_id, action_id, action_applied')
        .in('booking_id', bookingIds);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 15,
  });

  // Helper: Prüft ob eine Buchung den Marketing-Kriterien entspricht
  const matchesCriteria = (booking: any, criteria: any): boolean => {
    if (!criteria) return false;
    if (criteria.has_children && (!booking.number_of_children || booking.number_of_children <= 0)) {
      return false;
    }
    return true;
  };

  // Wenn deaktiviert, leere Listen zurückgeben
  if (!settings.is_enabled) {
    return {
      reminders: [],
      marketingCandidates: [],
      otherReminders: [],
      totalCount: 0,
      marketingCount: 0,
      isLoading: false,
      settings,
      markAsNoRating: markAsNoRatingMutation.mutate,
      isMarkingNoRating: markAsNoRatingMutation.isPending,
    };
  }

  // Kombiniere Daten zu RatingReminder Liste
  const ratingReminders: RatingReminder[] = (bookingsWithoutRatings || []).map(booking => {
    const daysSinceCheckout = differenceInDays(today, new Date(booking.check_out));
    
    // Finde passende Marketing-Aktion
    const matchedAction = marketingActions?.find(action => 
      matchesCriteria(booking, action.target_criteria)
    );
    
    // Finde Tracking für diese Buchung und Aktion
    const tracking = matchedAction 
      ? actionTracking?.find(t => t.booking_id === booking.id && t.action_id === matchedAction.id)
      : null;

    return {
      id: booking.id,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
      check_out: booking.check_out,
      platform: booking.platform,
      house_id: booking.house_id,
      house_name: (booking.houses as any)?.name || 'Unbekannt',
      days_since_checkout: daysSinceCheckout,
      is_marketing_candidate: !!matchedAction && (tracking?.action_applied || false),
      marketing_action_name: matchedAction?.name,
      action_id: matchedAction?.id,
      action_applied: tracking?.action_applied || false,
      number_of_children: booking.number_of_children || 0,
    };
  });

  // Sortieren: Marketing-Kandidaten zuerst, dann nach Checkout-Datum
  const sortedReminders = ratingReminders.sort((a, b) => {
    // Marketing-Kandidaten (mit angewendeter Aktion) zuerst
    if (a.is_marketing_candidate && !b.is_marketing_candidate) return -1;
    if (!a.is_marketing_candidate && b.is_marketing_candidate) return 1;
    // Dann nach Checkout-Datum (neueste zuerst)
    return new Date(b.check_out).getTime() - new Date(a.check_out).getTime();
  });

  // Statistiken
  const marketingCandidates = sortedReminders.filter(r => r.is_marketing_candidate);
  const otherReminders = sortedReminders.filter(r => !r.is_marketing_candidate);

  const isLoading = loadingSettings || loadingBookings || loadingMarketing || loadingTracking;

  return {
    reminders: sortedReminders,
    marketingCandidates,
    otherReminders,
    totalCount: sortedReminders.length,
    marketingCount: marketingCandidates.length,
    isLoading,
    settings,
    markAsNoRating: markAsNoRatingMutation.mutate,
    isMarkingNoRating: markAsNoRatingMutation.isPending,
  };
};
